import { v4 as uuidv4 } from 'uuid'
import { type ConsumeMessage } from 'amqplib'
import { Mutex } from 'async-mutex'
import RabbitMQ from '@modules/rabbitMQ'
import { type EnumQueueName, type IQueueMessage, type ISendOptions } from '@types'
import logger from '@logger'

type MessageHandler = (message: IQueueMessage) => Promise<any>

const llo = logger.logMeta.bind(null, { service: 'RabbitMQHelper' })

export const RabbitMQHelper = {
  activeJobs: new Map<string, boolean>(),
  queuedMessages: new Set<string>(),
  mutex: new Mutex(),

  /**
   * Ensures RabbitMQ has a valid connection/channel. Attempts to reconnect once if not connected.
   * Throws an error if it cannot establish a channel.
   */
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
        const uniqueJobKey = `${queueName}-${message.id}` // Unique key per queue and message ID

        const release = await this.mutex.acquire()
        if (this.activeJobs.has(uniqueJobKey)) {
          logger.warn('Duplicate message in queue, skipping', llo({ uniqueJobKey }))

          if (RabbitMQ.isConnected() && channel === RabbitMQ.getChannel()) {
            channel.ack(msg)
          } else {
            logger.warn('Channel closed before ack could be sent', llo({ uniqueJobKey }))
          }
          release()
          return
        }

        // Mark this message ID as being processed for the specific queue
        this.activeJobs.set(uniqueJobKey, true)
        release()

        try {
          const response = await messageHandler(message) // Process the message using the handler
          if (msg.properties.replyTo && msg.properties.correlationId) {
            channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
              correlationId: msg.properties.correlationId,
            })
          }
        } catch (error) {
          logger.error('Error processing message:', llo({ error, queueName }))
        } finally {
          const releaseFinal = await this.mutex.acquire()
          try {
            this.activeJobs.delete(uniqueJobKey) // Remove the job from active jobs map
            this.queuedMessages.delete(uniqueJobKey) // Remove from queuedMessages
          } finally {
            releaseFinal()
          }
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

  async sendMessage(queueName: EnumQueueName, message: IQueueMessage, opts: ISendOptions = {}): Promise<void> {
    await RabbitMQHelper.ensureChannelConnected()

    const channel = RabbitMQ.getChannel()
    if (!channel) {
      throw new Error('RabbitMQ channel is not initialized.')
    }

    // Ensure the queue exists
    await channel.assertQueue(queueName, { durable: true })
    const uniqueQueueKey = `${queueName}-${message.id}` // Unique key per queue and message ID

    const release = await this.mutex.acquire()
    try {
      if (this.queuedMessages.has(uniqueQueueKey)) {
        logger.warn('Skipping duplicate message', llo({ uniqueQueueKey }))
        return
      }
      // Mark it as queued
      this.queuedMessages.add(uniqueQueueKey)
    } finally {
      release()
    }

    if (opts.waitResponse) {
      // Setup for request-response pattern
      const replyQueue = await channel.assertQueue('', { exclusive: true })
      const correlationId = uuidv4()

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Response timed out.'))
        }, opts.timeout || 5000)

        channel.consume(
          replyQueue.queue,
          (msg: ConsumeMessage | null) => {
            if (msg && msg.properties.correlationId === correlationId) {
              clearTimeout(timeout)
              const response = JSON.parse(msg.content.toString())
              resolve(response)
              channel.ack(msg)
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
      // Send message without waiting for a response
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
