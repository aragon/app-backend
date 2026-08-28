import config from '@config'
import utils from '@helpers/utils'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { type EnumQueueName, type IQueueMessage, type ISendOptions, type IThrottleOptions } from '@types'
import { type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib'
import { Mutex } from 'async-mutex'
import { v4 as uuidv4 } from 'uuid'

const llo = logger.logMeta.bind(null, { service: 'helpers:RabbitMQHelper' })

interface IProcessOptions {
  /** Requeue a failed message after a short delay instead of leaving it unacknowledged. */
  requeueOnError?: boolean
  retryDelayMs?: number
  /**
   * Republishes failed messages through a delayed queue with exponential backoff.
   * After the final attempt, the original payload is moved to the dead-letter queue.
   */
  retry?: {
    maxAttempts: number
    baseDelayMs: number
    maxDelayMs: number
    deadLetterQueue: EnumQueueName
  }
}

const RETRY_ATTEMPT_HEADER = 'x-aragon-retry-attempt'
const RETRY_ERROR_HEADER = 'x-aragon-retry-error'

const getRetryAttempt = (headers: Record<string, unknown> | undefined): number => {
  const value = Number(headers?.[RETRY_ATTEMPT_HEADER] ?? 0)
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

const getRetryDelayMs = (attempt: number, baseDelayMs: number, maxDelayMs: number): number => {
  return Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), maxDelayMs)
}

const errorMessage = (error: unknown): string => {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
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

  async process(
    queueName: EnumQueueName,
    handler: (data: any) => Promise<any>,
    options: IProcessOptions = {},
  ): Promise<void> {
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

            if (msg.properties.replyTo && msg.properties.correlationId) {
              try {
                const response = await handler(data)
                await channelWrapper.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                  correlationId: msg.properties.correlationId,
                  contentType: 'application/json',
                })
                channel.ack(msg)
              } catch (handlerErr) {
                logger.error('Error in messageHandler', llo({ queueName, data, error: handlerErr }))
              }
              return
            }

            const release = await RabbitMQHelper.mutex.acquire()
            try {
              if (RabbitMQHelper.activeJobs.has(uniqueKey)) {
                channel.ack(msg)
                return
              }
              RabbitMQHelper.activeJobs.set(uniqueKey, true)
            } finally {
              release()
            }

            try {
              await handler(data)
              const releaseFinal = await RabbitMQHelper.mutex.acquire()
              try {
                RabbitMQHelper.activeJobs.delete(uniqueKey) // Remove the job from active jobs map
                RabbitMQHelper.queuedMessages.delete(uniqueKey) // Remove from queuedMessages
              } finally {
                releaseFinal()
              }
              channel.ack(msg)
            } catch (handlerErr) {
              logger.error('Error in messageHandler', llo({ queueName, data, error: handlerErr }))
              if (options.retry) {
                const previousAttempts = getRetryAttempt(msg.properties.headers)
                const attempt = previousAttempts + 1
                const retryHeaders = {
                  ...msg.properties.headers,
                  [RETRY_ATTEMPT_HEADER]: attempt,
                  [RETRY_ERROR_HEADER]: errorMessage(handlerErr),
                }

                try {
                  if (attempt >= options.retry.maxAttempts) {
                    await channelWrapper.sendToQueue(options.retry.deadLetterQueue, data, {
                      persistent: true,
                      contentType: 'application/json',
                      headers: retryHeaders,
                    })
                    logger.error(
                      'Message exhausted retry attempts and was moved to the dead-letter queue',
                      llo({
                        queueName,
                        deadLetterQueue: options.retry.deadLetterQueue,
                        id: data?.id,
                        attempt,
                        error: handlerErr,
                      }),
                    )
                  } else {
                    const delayMs = getRetryDelayMs(attempt, options.retry.baseDelayMs, options.retry.maxDelayMs)
                    await RabbitMQHelper.sendDelayedMessageOrThrow(queueName, data, delayMs, retryHeaders)
                    logger.warn(
                      'Message handler failed; retry scheduled',
                      llo({ queueName, id: data?.id, attempt, delayMs, error: handlerErr }),
                    )
                  }

                  await RabbitMQHelper.executeWithMutex(() => RabbitMQHelper.activeJobs.delete(uniqueKey))
                  channel.ack(msg)
                } catch (retryErr) {
                  logger.error(
                    'Failed to schedule retry or dead-letter message',
                    llo({ queueName, data, error: retryErr }),
                  )
                  await RabbitMQHelper.executeWithMutex(() => RabbitMQHelper.activeJobs.delete(uniqueKey))
                  try {
                    channel.nack(msg, false, true)
                  } catch (nackErr) {
                    logger.warn('Failed to nack message after retry scheduling error', llo({ queueName, nackErr }))
                  }
                }
              } else if (options.requeueOnError) {
                await utils.wait(options.retryDelayMs ?? 3000)
                await RabbitMQHelper.executeWithMutex(() => RabbitMQHelper.activeJobs.delete(uniqueKey))
                try {
                  channel.nack(msg, false, true)
                } catch (nackErr) {
                  // A closed channel requeues unacknowledged deliveries itself.
                  logger.warn('Failed to nack message after handler error', llo({ queueName, nackErr }))
                }
              }
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
      const release = await RabbitMQHelper.mutex.acquire()
      try {
        if (RabbitMQHelper.queuedMessages.has(uniqueKey)) {
          logger.warn('Skipping duplicate message', llo({ uniqueKey }))
          return
        }
        RabbitMQHelper.queuedMessages.add(uniqueKey)
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

  /**
   * Publish a message that is delivered to `queueName` after `delayMs`, via a TTL +
   * dead-letter wait queue. Consumers of `queueName` need no changes.
   */
  async sendDelayedMessage(
    queueName: EnumQueueName,
    payload: any,
    delayMs: number,
    headers?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await RabbitMQHelper.sendDelayedMessageOrThrow(queueName, payload, delayMs, headers)
    } catch (err) {
      logger.error('Error sendDelayedMessage', llo({ queueName, delayMs, err }))
    }
  },

  /** Publishes to the retry wait queue and lets failures surface to the consumer. */
  async sendDelayedMessageOrThrow(
    queueName: EnumQueueName,
    payload: any,
    delayMs: number,
    headers?: Record<string, unknown>,
  ): Promise<void> {
    const channelWrapper = RabbitMQ.getDelayChannel(queueName, delayMs)
    await channelWrapper.sendToQueue(`${queueName}.wait.${delayMs}`, payload, {
      persistent: true,
      contentType: 'application/json',
      ...(headers ? { headers } : {}),
    })
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
      const response = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(async () => {
          logger.warn('Timeout waiting for response', { queueName, correlationId, payload, opts })
          resolve(null)
        }, opts.timeout || 5000)
        channelWrapper
          .addSetup(async (channel: ConfirmChannel) => {
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
          .catch(reject)
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

  async sendMessageWithThrottle(
    queueName: EnumQueueName,
    payload: { id: string; params: any },
    options?: IThrottleOptions,
  ): Promise<void> {
    const maxQueueSize = options?.maxQueueSize ?? config.RABBITMQ.MAX_QUEUE_SIZE
    const retryDelay = options?.retryDelay ?? config.RABBITMQ.THROTTLE_RETRY_DELAY

    // Extract params as the logging context to avoid duplication
    const logContext = { ...payload.params, ...(options?.logContext ?? {}) }

    while (true) {
      const count = await RabbitMQHelper.getQueueMessageCount(queueName)

      if (count === null) {
        logger.error(
          `Unable to get message count for queue "${queueName}". Retrying...`,
          llo({ ...logContext, messageId: payload.id }),
        )
        await utils.wait(retryDelay)
        continue
      }

      if (count < maxQueueSize) {
        await RabbitMQHelper.sendMessage(queueName, payload)
        logger.verbose(
          `Message sent to queue "${queueName}"`,
          llo({ queueName, messageId: payload.id, count: count + 1, ...logContext }),
        )
        break
      } else {
        logger.warn(
          `Queue "${queueName}" has reached the limit. Waiting...`,
          llo({ queueName, waitingMessageId: payload.id, count, maxQueueSize, ...logContext }),
        )
        await utils.wait(retryDelay)
      }
    }
  },
}

export default RabbitMQHelper
