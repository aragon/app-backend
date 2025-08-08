import RabbitMQ from '@modules/rabbitMQ'
import { type EnumQueueName, type IQueueMessage } from '@types'
import logger from '@logger'
import { type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib'
import { v4 as uuidv4 } from 'uuid'
import { Mutex } from 'async-mutex'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'helpers:RabbitMQHelper' })

export interface ISendOptions {
  waitResponse?: boolean
  timeout?: number
}

const RabbitMQHelper = {
  activeJobs: new Map<string, boolean>(),
  queuedMessages: new Set<string>(),
  mutex: new Mutex(),

  parseData(msg: ConsumeMessage): IQueueMessage | any {
    let data: IQueueMessage | any = null
    if (Buffer.isBuffer(msg.content)) {
      try {
        data = JSON.parse(msg?.content?.toString('utf8')) as IQueueMessage
      } catch (error) {
        logger.error('Failed to parse Buffer as JSON', llo({ error }))
      }
    } else {
      data = msg.content as any as IQueueMessage
    }

    if (data?.type === 'Buffer') {
      data = JSON.parse(Buffer.from(data?.data).toString('utf8')) as IQueueMessage
    }
    return data
  },

  // Execute a callback under mutex protection.
  executeWithMutex: async <T>(callback: () => T | Promise<T>): Promise<T> => {
    const release = await RabbitMQHelper.mutex.acquire()
    try {
      return await callback()
    } finally {
      release()
    }
  },

  async process(queueName: EnumQueueName, handler: (data: any) => Promise<any>): Promise<void> {
    try {
      const channelWrapper = RabbitMQ.getChannel(queueName)
      await channelWrapper.addSetup(async (channel: ConfirmChannel) => {
        const concurrency = config.RABBITMQ.DEFAULT_CONCURRENCY
        await channel.prefetch(concurrency)
        await channel.assertQueue(queueName, { durable: true })
        await channel.consume(
          queueName,
          async (msg: ConsumeMessage | null) => {
            if (!msg) {
              logger.warn('No message to consume', llo({ queueName }))
              return null
            }

            // decode data
            const data = RabbitMQHelper.parseData(msg)
            // Unique key per queue and message ID
            const uniqueKey = `${queueName}-${data?.id}`

            const release = await this.mutex.acquire()
            try {
              if (this.activeJobs.has(uniqueKey)) {
                channel.ack(msg)
                return
              }
              this.activeJobs.set(uniqueKey, true)
            } finally {
              release()
            }

            try {
              const response = await handler(data)
              if (msg.properties.replyTo && msg.properties.correlationId) {
                await channelWrapper.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                  correlationId: msg.properties.correlationId,
                  contentType: 'application/json',
                })
              }
              const releaseFinal = await this.mutex.acquire()
              try {
                this.activeJobs.delete(uniqueKey) // Remove the job from active jobs map
                this.queuedMessages.delete(uniqueKey) // Remove from queuedMessages
              } finally {
                releaseFinal()
              }
              channel.ack(msg)
            } catch (handlerErr) {
              logger.error('Error in messageHandler', llo({ queueName, data, error: handlerErr }))
            }
          },
          { noAck: false },
        )
      })
    } catch (err) {
      logger.error('rabbit process error', llo({ queueName, err }))
    }
  },

  async sendMessage(
    queueName: EnumQueueName,
    payload: any,
    opts: ISendOptions = { waitResponse: false, timeout: config.RABBITMQ.TIMEOUT },
  ): Promise<any> {
    const uniqueKey = `${queueName}-${payload.id}`

    if (!opts.waitResponse) {
      const release = await this.mutex.acquire()
      try {
        if (this.queuedMessages.has(uniqueKey)) {
          logger.warn('Skipping duplicate message', llo({ uniqueKey }))
          return
        }
        this.queuedMessages.add(uniqueKey)
      } finally {
        release()
      }
    }

    if (opts.waitResponse) {
      try {
        const channelWrapper = RabbitMQ.getChannel(queueName)
        return await RabbitMQHelper._sendMessageWithResponse(channelWrapper, queueName, payload, uniqueKey, opts)
      } catch (err) {
        logger.error('Error sendMessage with response', llo({ queueName, err }))
        return null
      }
    }

    try {
      const channelWrapper = RabbitMQ.getChannel(queueName)
      await channelWrapper.sendToQueue(queueName, payload, {
        persistent: true,
        contentType: 'application/json',
      })
    } catch (err) {
      logger.error('Error sendMessage', llo({ queueName, err }))
    }

    await RabbitMQHelper.executeWithMutex(() => RabbitMQHelper.queuedMessages.delete(uniqueKey))
    return null
  },

  async _sendMessageWithResponse(
    channelWrapper: any,
    queueName: EnumQueueName,
    payload: any,
    uniqueKey: string,
    opts: ISendOptions,
  ): Promise<any> {
    const correlationId = uuidv4()
    try {
      const response = await new Promise(resolve => {
        const timeoutId = setTimeout(async () => {
          logger.warn('Timeout waiting for response', { queueName, correlationId, payload, opts })
          resolve(null)
        }, opts.timeout || 5000)
        channelWrapper.addSetup(async (channel: ConfirmChannel) => {
          const { queue: replyQueue } = await channel.assertQueue('', { exclusive: true })
          const { consumerTag } = await channel.consume(replyQueue, async (msg: ConsumeMessage | null) => {
            if (!msg) return null
            if (msg.properties.correlationId === correlationId) {
              try {
                channel.ack(msg)
              } catch (ackErr) {
                logger.warn('Failed to ack ephemeral msg', llo({ queueName, ackErr }))
              }
              clearTimeout(timeoutId)
              resolve(RabbitMQHelper.parseData(msg))
            }
          })
          const publishOpts: Options.Publish = {
            persistent: true,
            correlationId,
            replyTo: replyQueue,
            contentType: 'application/json',
          }
          const queueResult = await channelWrapper.sendToQueue(queueName, payload, publishOpts)
          if (!queueResult) {
            if (consumerTag) {
              try {
                await channel.cancel(consumerTag)
              } catch (cancelErr) {
                logger.warn('Failed to cancel ephemeral consumer on timeout', llo({ queueName, cancelErr }))
              }
            }
            logger.error('Failed to send message to queue', llo({ queueName, correlationId, payload }))
            resolve(null)
          }
        })
      })
      return response
    } catch (err) {
      logger.error('_sendMessageWithResponse error', llo({ queueName, payload, uniqueKey, err }))
      return null
    }
  },

  async getQueueMessageCount(queueName: EnumQueueName): Promise<number | null> {
    try {
      const channelWrapper = RabbitMQ.getChannel(queueName)
      let messageCount: number | null = null
      await channelWrapper.addSetup(async (channel: ConfirmChannel) => {
        const queueInfo = await channel.checkQueue(queueName)
        messageCount = queueInfo.messageCount
        logger.verbose(`Queue "${queueName}" has ${messageCount} messages`, llo({ queueName, messageCount }))
      })
      return messageCount
    } catch (err) {
      logger.error('getQueueMessageCount error', llo({ queueName, err }))
      return null
    }
  },
}

export default RabbitMQHelper
