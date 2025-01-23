import { v4 as uuidv4 } from 'uuid'
import { type ConsumeMessage } from 'amqplib'
import { Mutex } from 'async-mutex'
import RabbitMQ from '@modules/rabbitMQ'
import { type EnumQueueName, type IQueueMessage, type ISendOptions } from '@types'
import logger from '@logger'

type MessageHandler = (message: IQueueMessage) => Promise<any>

const llo = logger.logMeta.bind(null, { service: 'RabbitMQHelper' })

export const RabbitMQHelper = {
  queuedMessages: new Set<string>(),
  mutex: new Mutex(),

  async ensureChannelConnected() {
    if (!RabbitMQ.isConnected()) {
      logger.warn('RabbitMQ not connected. Attempting to connect...', llo({}))
      await RabbitMQ.connect()
      if (!RabbitMQ.isConnected()) {
        throw new Error('Unable to establish a RabbitMQ channel')
      }
    }
  },

  async process(queueName: EnumQueueName, concurrency: number, messageHandler: MessageHandler): Promise<void> {
    await RabbitMQHelper.ensureChannelConnected()
    const channel = RabbitMQ.getChannel()
    if (!channel) {
      throw new Error('RabbitMQ channel is not initialized.')
    }

    // Set up prefetch for concurrency control
    channel.prefetch(concurrency)

    // Start consuming messages from the specified queue
    await channel.assertQueue(queueName, { durable: true })

    channel.consume(
      queueName,
      async (msg: ConsumeMessage | null) => {
        if (msg === null) return // Exit if the message is null

        const message: IQueueMessage = JSON.parse(msg.content.toString())
        const uniqueQueueKey = `${queueName}-${message.id}` // Unique key per queue and message ID

        try {
          const response = await messageHandler(message) // Process the message using the handler
          if (msg.properties.replyTo && msg.properties.correlationId) {
            channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
              correlationId: msg.properties.correlationId,
            })
          }
        } catch (error) {
          logger.error('Error processing message:', llo({ error, queueName, messageId: message.id }))
        } finally {
          // Ensure cleanup happens regardless of resolve or reject
          await this.executeWithMutex(() => {
            this.queuedMessages.delete(uniqueQueueKey)
          })

          if (RabbitMQ.isConnected() && channel === RabbitMQ.getChannel()) {
            channel.ack(msg) // Acknowledge that the message has been processed
          } else {
            logger.warn('Channel closed before ack could be sent', llo({ queueName, messageId: message.id }))
          }
        }
      },
      { noAck: false },
    )
  },

  async executeWithMutex<T>(callback: () => Promise<T> | T): Promise<T> {
    const release = await this.mutex.acquire()
    try {
      return await callback()
    } finally {
      release()
    }
  },

  async sendMessage(queueName: EnumQueueName, message: IQueueMessage, opts: ISendOptions = {}): Promise<void> {
    await RabbitMQHelper.ensureChannelConnected()

    const channel = RabbitMQ.getChannel()
    if (!channel) {
      throw new Error('RabbitMQ channel is not initialized.')
    }

    // Ensure the queue exists
    await channel.assertQueue(queueName, { durable: true })
    const uniqueQueueKey = `${queueName}-${message.id}` // Unique key per queue and message ID

    // Use the mutex utility to handle queuedMessages safely
    const isDuplicate = await this.executeWithMutex(() => {
      if (this.queuedMessages.has(uniqueQueueKey)) {
        logger.warn('Skipping duplicate message', llo({ uniqueQueueKey, messageId: message.id }))
        return true
      }
      // Mark it as queued
      this.queuedMessages.add(uniqueQueueKey)
      return false
    })

    if (isDuplicate) {
      return // Duplicate found; message not sent
    }

    if (opts.waitResponse) {
      const replyQueue = await channel.assertQueue('', { exclusive: true })
      const correlationId = uuidv4()

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(async () => {
          // Clean up the queuedMessages in case of timeout
          await this.executeWithMutex(() => {
            this.queuedMessages.delete(uniqueQueueKey)
          })
          reject(new Error('Response timed out.'))
        }, opts.timeout || 5000)

        channel.consume(
          replyQueue.queue,
          async (msg: ConsumeMessage | null) => {
            if (msg && msg.properties.correlationId === correlationId) {
              clearTimeout(timeout)
              const response = JSON.parse(msg.content.toString())
              resolve(response)

              if (RabbitMQ.isConnected() && channel === RabbitMQ.getChannel()) {
                channel.ack(msg) // Acknowledge that the message has been processed
              } else {
                logger.warn('Channel closed before ack could be sent', llo({ queueName, messageId: message.id }))
              }

              // Cleanup after successful response
              await this.executeWithMutex(() => {
                this.queuedMessages.delete(uniqueQueueKey)
              })
            }
          },
          { noAck: false },
        )

        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
          persistent: true,
          replyTo: replyQueue.queue,
          correlationId,
        })
      })
    } else {
      // Send the message without waiting for a response
      channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), { persistent: true })
      return Promise.resolve()
    }
  },

  async getQueueMessageCount(queueName: EnumQueueName) {
    const channel = RabbitMQ.getChannel()
    if (!channel) {
      throw new Error('RabbitMQ channel is not initialized.')
    }

    const queueInfo = await channel.checkQueue(queueName)
    return { count: queueInfo.messageCount }
  },
}
