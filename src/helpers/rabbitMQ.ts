import RabbitMQ from '@modules/rabbitMQ'
import { type EnumQueueName } from '@types'
import logger from '@logger'
import { type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib'
import { v4 as uuidv4 } from 'uuid'
import { Mutex } from 'async-mutex'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'RabbitMQHelper' })

export interface ISendOptions {
  waitResponse?: boolean
  timeout?: number
}

const RabbitMQHelper = {
  queuedMessages: new Set<string>(),
  mutex: new Mutex(),

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
        await channel.consume(
          queueName,
          async (msg: ConsumeMessage | null) => {
            if (!msg) {
              logger.warn('No message to consume', llo({ queueName }))
              return null
            }
            try {
              let data = msg.content
              if (Buffer.isBuffer(data)) {
                try {
                  data = JSON.parse(data.toString('utf8'))
                } catch (parseErr) {
                  logger.error('Failed to parse Buffer as JSON', llo({ queueName, parseErr }))
                }
              }
              const response = await handler(data)
              if (msg.properties.replyTo && msg.properties.correlationId) {
                const publishOpts: Options.Publish = {
                  correlationId: msg.properties.correlationId,
                  contentType: 'application/json',
                }
                await channelWrapper.sendToQueue(msg.properties.replyTo, response, publishOpts)
              }
              channel.ack(msg)
            } catch (handlerErr) {
              logger.error('Error in messageHandler', llo({ queueName, error: handlerErr }))
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

    const isDuplicate = await RabbitMQHelper.executeWithMutex(() => {
      if (RabbitMQHelper.queuedMessages.has(uniqueKey)) {
        logger.warn('Skipping duplicate message', llo({ queueName, messageId: payload.id }))
        return true
      }
      RabbitMQHelper.queuedMessages.add(uniqueKey)
      return false
    })
    if (isDuplicate) return null

    try {
      const channelWrapper = RabbitMQ.getChannel(queueName)
      if (opts.waitResponse) {
        return await RabbitMQHelper._sendMessageWithResponse(channelWrapper, queueName, payload, uniqueKey, opts)
      }
      await channelWrapper.sendToQueue(queueName, payload, { persistent: true, contentType: 'application/json' })
      return null
    } catch (err) {
      logger.error('sendMessage error', llo({ queueName, err }))
      return null
    }
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
          logger.warn('Timeout waiting for response', { queueName, correlationId })
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
              let responseData: any = null
              try {
                if (Buffer.isBuffer(msg.content)) {
                  responseData = JSON.parse(msg.content.toString('utf8'))
                } else {
                  responseData = msg.content
                }
              } catch (parseErr) {
                logger.error('Failed to parse ephemeral response as JSON', llo({ queueName, parseErr }))
              }
              await RabbitMQHelper.executeWithMutex(() => RabbitMQHelper.queuedMessages.delete(uniqueKey))
              clearTimeout(timeoutId)
              resolve(responseData)
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
            await RabbitMQHelper.executeWithMutex(() => RabbitMQHelper.queuedMessages.delete(uniqueKey))
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
