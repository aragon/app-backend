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

/**
 * RabbitMQ's built-in RPC reply address. Replies come back on the channel that published the
 * request, so a call needs no queue and no consumer of its own.
 */
const DIRECT_REPLY_QUEUE = 'amq.rabbitmq.reply-to'

/** How long a request waits for its reply when the caller names no timeout of its own. */
const DEFAULT_RESPONSE_TIMEOUT_MS = 5000

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
  /** Callers waiting on an RPC reply, keyed by the `correlationId` they published with. */
  pendingReplies: new Map<string, (value: any) => void>(),
  /** The reply consumer of each channel, so it is attached once and not once per call. */
  replyConsumers: new WeakMap<object, Promise<unknown>>(),

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
              let response: any = null

              try {
                response = await handler(data)
              } catch (handlerErr) {
                logger.error('Error in messageHandler', llo({ queueName, data, error: handlerErr }))
              }

              // A caller waiting on a reply is owed one even when the handler failed. `null` is what
              // its timeout would have produced anyway, so it gets the same answer without the wait.
              try {
                await channelWrapper.sendToQueue(
                  msg.properties.replyTo,
                  Buffer.from(JSON.stringify(response ?? null)),
                  {
                    correlationId: msg.properties.correlationId,
                    contentType: 'application/json',
                  },
                )
              } catch (replyErr) {
                logger.error('Failed to reply to message', llo({ queueName, data, error: replyErr }))
              }

              // Acknowledge whatever happened. An unacknowledged message holds its prefetch slot for
              // the life of the connection, and enough of them stop the queue being delivered at all.
              try {
                channel.ack(msg)
              } catch (ackErr) {
                logger.warn('Failed to ack replied message', llo({ queueName, ackErr }))
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

  /**
   * Attach this channel's reply consumer, once.
   *
   * `addSetup` keeps every function it is handed and replays all of them on each reconnect, so one
   * setup per call grows without end: the channel ends up holding a reply queue and a consumer for
   * every request it has ever sent, and a reconnect then replays the lot. One consumer per channel,
   * with `correlationId` picking the caller, is all an RPC needs.
   */
  async _ensureReplyConsumer(channelWrapper: any): Promise<void> {
    const existing = RabbitMQHelper.replyConsumers.get(channelWrapper)
    if (existing) {
      await existing
      return
    }

    const setup = async (channel: ConfirmChannel) => {
      await channel.consume(
        DIRECT_REPLY_QUEUE,
        (msg: ConsumeMessage | null) => {
          const correlationId = msg?.properties?.correlationId
          if (!correlationId) return

          const resolve = RabbitMQHelper.pendingReplies.get(correlationId)
          if (!resolve) return

          RabbitMQHelper.pendingReplies.delete(correlationId)
          resolve(RabbitMQHelper.parseData(msg!))
        },
        { noAck: true },
      )
    }

    const started = channelWrapper.addSetup(setup)
    RabbitMQHelper.replyConsumers.set(channelWrapper, started)

    try {
      await started
    } catch (err) {
      // A failed setup is still on the channel's replay list, so take it back out before the next
      // call adds its own and the channel ends up consuming twice.
      RabbitMQHelper.replyConsumers.delete(channelWrapper)
      await Promise.resolve(channelWrapper.removeSetup(setup)).catch(() => undefined)
      throw err
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
    // One deadline covers the whole call. Attaching the consumer talks to the broker too, so a
    // caller that waited its timeout is owed an answer whether or not the setup ever came back.
    const deadline = Date.now() + (opts.timeout || DEFAULT_RESPONSE_TIMEOUT_MS)
    const left = () => Math.max(1, deadline - Date.now())
    try {
      await RabbitMQHelper._withDeadline(
        RabbitMQHelper._ensureReplyConsumer(channelWrapper),
        left(),
        'reply consumer setup',
      )

      return await new Promise(resolve => {
        const settle = (value: any) => {
          clearTimeout(timeoutId)
          RabbitMQHelper.pendingReplies.delete(correlationId)
          resolve(value)
        }

        const timeoutId = setTimeout(() => {
          logger.warn('Timeout waiting for response', { queueName, correlationId, payload, opts })
          settle(null)
        }, left())

        RabbitMQHelper.pendingReplies.set(correlationId, settle)

        // The wrapper buffers what it cannot publish yet. Without a timeout of its own a request
        // this caller has already given up on stays buffered and is sent after the next reconnect.
        const publishOpts: Options.Publish & { timeout?: number } = {
          persistent: true,
          correlationId,
          replyTo: DIRECT_REPLY_QUEUE,
          contentType: 'application/json',
          timeout: left(),
        }

        Promise.resolve(channelWrapper.sendToQueue(queueName, payload, publishOpts))
          .then(queueResult => {
            if (queueResult) return
            logger.error('Failed to send message to queue', llo({ queueName, correlationId, payload }))
            settle(null)
          })
          .catch(err => {
            logger.error('Failed to send message to queue', llo({ queueName, correlationId, payload, err }))
            settle(null)
          })
      })
    } catch (err) {
      RabbitMQHelper.pendingReplies.delete(correlationId)
      logger.error('_sendMessageWithResponse error', llo({ queueName, payload, uniqueKey, err }))
      return null
    }
  },

  /** Rejects when the work has not finished in time, so a stalled broker cannot hold a caller for ever. */
  _withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
      work.then(
        value => {
          clearTimeout(timer)
          resolve(value)
        },
        error => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  },

  async getQueueMessageCount(queueName: EnumQueueName): Promise<number | null> {
    try {
      const channelWrapper = RabbitMQ.getChannel(queueName)
      let messageCount: number | null = null
      // A one-off read still has to take its setup back out: `addSetup` replays everything it has
      // been given on every reconnect, and this one is polled in a loop by `sendMessageWithThrottle`.
      const read = async (channel: ConfirmChannel) => {
        const queueInfo = await channel.checkQueue(queueName)
        messageCount = queueInfo.messageCount
        logger.verbose(`Queue "${queueName}" has ${messageCount} messages`, llo({ queueName, messageCount }))
      }

      try {
        await channelWrapper.addSetup(read)
      } finally {
        await channelWrapper.removeSetup(read)
      }

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
