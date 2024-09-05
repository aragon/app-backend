import { v4 as uuidv4 } from 'uuid'
import { type ConsumeMessage } from 'amqplib'
import { Mutex } from 'async-mutex'
import RabbitMQ from '@modules/rabbitMQ'
import { type EnumQueueName, type IQueueMessage, type ISendOptions } from '@types'
import logger from '@logger'

type MessageHandler = (message: IQueueMessage) => Promise<void>

const llo = logger.logMeta.bind(null, { service: 'RabbitMQHelper' })

export const RabbitMQHelper = {
  activeJobs: new Map<string, boolean>(),
  mutex: new Mutex(),

  async process(queueName: EnumQueueName, concurrency: number, messageHandler: MessageHandler): Promise<void> {
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
          channel.ack(msg)
          release()
          return
        }

        // Mark this message ID as being processed for the specific queue
        this.activeJobs.set(uniqueJobKey, true)
        release()

        try {
          await messageHandler(message) // Process the message using the handler
        } catch (error) {
          logger.error('Error processing message:', llo({ error }))
        } finally {
          const release = await this.mutex.acquire()
          this.activeJobs.delete(uniqueJobKey) // Remove the job from active jobs map
          release()
          channel.ack(msg) // Acknowledge that the message has been processed
        }
      },
      { noAck: false },
    )
  },

  async sendMessage(queueName: EnumQueueName, message: IQueueMessage, opts: ISendOptions = {}): Promise<void> {
    const channel = RabbitMQ.getChannel()
    if (!channel) {
      throw new Error('RabbitMQ channel is not initialized.')
    }

    // Ensure the queue exists
    await channel.assertQueue(queueName, { durable: true })

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
}
