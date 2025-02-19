import amqp, { type Replies, type Connection, type Channel } from 'amqplib'
import config from '@config'
import logger from '@logger'
import { EnumQueueName } from '@types'

const llo = logger.logMeta.bind(null, { service: 'rabbitmq' })

const RabbitMQ = {
  connection: null as Connection | null,
  channel: null as Channel | null,
  reconnectTimer: null as NodeJS.Timeout | null,
  isReconnecting: false,

  async _connect(): Promise<void> {
    if (RabbitMQ.isConnected()) {
      logger.verbose('RabbitMQ: Already connected', llo({}))
      return
    }

    if (RabbitMQ.isReconnecting) {
      logger.verbose('RabbitMQ: Reconnect attempt already in progress', llo({}))
      return
    }

    RabbitMQ.isReconnecting = true

    try {
      RabbitMQ.connection = await amqp.connect(config.RABBITMQ.URI)

      RabbitMQ.connection.on('close', async err => {
        logger.error('RabbitMQ connection closed', llo({ err }))
        await RabbitMQ.handleReconnect(true) // Full reconnect
      })

      RabbitMQ.connection.on('error', async err => {
        logger.error('RabbitMQ connection error', llo({ err }))
        await RabbitMQ.handleReconnect(true) // Full reconnect
      })

      // Create initial channel
      await RabbitMQ.createChannel()

      if (config.RABBITMQ.CLEAN_QUEUE) {
        await RabbitMQ.cleanAllQueues()
      }

      RabbitMQ.isReconnecting = false
      logger.info('RabbitMQ connected', llo({ url: config.RABBITMQ.URI }))
    } catch (err) {
      RabbitMQ.isReconnecting = false
      logger.error('RabbitMQ connection error', llo({ err }))
      throw err
    }
  },

  async connect(): Promise<void> {
    try {
      await RabbitMQ._connect()
    } catch (_) {
      RabbitMQ.scheduleReconnect()
    }
  },

  /**
   * Create a new channel without resetting the connection.
   */
  async createChannel(): Promise<void> {
    if (!RabbitMQ.connection) {
      logger.error('RabbitMQ: No active connection to create a channel', llo({}))
      return
    }

    try {
      RabbitMQ.channel = await RabbitMQ.connection.createChannel()

      RabbitMQ.channel.on('close', async () => {
        logger.error('RabbitMQ channel closed', llo({}))
        await RabbitMQ.handleReconnect(false) // Only recreate the channel
      })

      RabbitMQ.channel.on('error', async err => {
        logger.error('RabbitMQ channel error', llo({ err }))
        await RabbitMQ.handleReconnect(false) // Only recreate the channel
      })

      logger.verbose('RabbitMQ channel created', llo({}))
    } catch (err) {
      logger.error('Failed to create RabbitMQ channel', llo({ err }))
      await RabbitMQ.handleReconnect(true) // Full reconnect if channel creation fails
    }
  },

  /**
   * Handle reconnection logic.
   * @param fullReconnect If true, restarts the entire connection. Otherwise, just reopens the channel.
   */
  async handleReconnect(fullReconnect: boolean): Promise<void> {
    if (fullReconnect) {
      await RabbitMQ.forceClose()
      RabbitMQ.scheduleReconnect()
    } else {
      await RabbitMQ.createChannel()
    }
  },

  /**
   * Schedule a reconnect with a delay, avoiding repeated timers.
   */
  scheduleReconnect() {
    const delay = config.RABBITMQ.RECONNECT_TIME || 5000

    if (RabbitMQ.reconnectTimer) {
      clearTimeout(RabbitMQ.reconnectTimer)
    }

    RabbitMQ.reconnectTimer = setTimeout(async () => {
      try {
        await RabbitMQ._connect()
        RabbitMQ.reconnectTimer = null
        logger.verbose('RabbitMQ successfully reconnected', llo({}))
      } catch (reconnectErr) {
        logger.error('RabbitMQ reconnection attempt failed', llo({ reconnectErr }))
        RabbitMQ.scheduleReconnect()
      }
    }, delay)
  },

  /**
   * Purges all messages from queues.
   */
  async cleanAllQueues(): Promise<void> {
    try {
      if (!RabbitMQ.channel) {
        logger.warn('Cannot clean queues: Channel is not available', llo())
        return
      }

      for (const queueName of Object.values(EnumQueueName)) {
        await RabbitMQ.channel.purgeQueue(queueName)
        logger.info(`Queue "${queueName}" purged`, llo({ queueName }))
      }
    } catch (err) {
      logger.error('Failed to clean RabbitMQ queues', llo({ err }))
    }
  },

  /**
   * Force close RabbitMQ connection and channel.
   */
  async forceClose(): Promise<void> {
    if (RabbitMQ.reconnectTimer) {
      clearTimeout(RabbitMQ.reconnectTimer)
      RabbitMQ.reconnectTimer = null
    }

    // Close channel
    try {
      if (RabbitMQ.channel) {
        await RabbitMQ.channel.close()
      }
    } catch (_) {
      // Ignore
    } finally {
      RabbitMQ.channel = null
    }

    // Close connection
    try {
      if (RabbitMQ.connection) {
        await RabbitMQ.connection.close()
      }
    } catch (err) {
      // Ignore
    } finally {
      RabbitMQ.connection = null
    }
  },

  /**
   * Graceful shutdown, e.g., on server stop.
   */
  async close(): Promise<void> {
    await RabbitMQ.forceClose()
    logger.verbose('RabbitMQ disconnected', llo({}))
  },

  /**
   * Check if both connection and channel are established.
   */
  isConnected(): boolean {
    return !!RabbitMQ.connection && !!RabbitMQ.channel
  },

  /**
   * Returns the existing channel (null if not connected).
   */
  getChannel(): Channel | null {
    return RabbitMQ.channel || null
  },

  async getMessageCount(queueName: string): Promise<number | null> {
    if (!RabbitMQ.channel) {
      logger.warn('Cannot get message count: Channel is not available', llo())
      return null
    }

    try {
      const queueStatus: Replies.AssertQueue = await RabbitMQ.channel.checkQueue(queueName)
      logger.info(
        `Queue "${queueName}" has ${queueStatus.messageCount} messages`,
        llo({ queueName, messageCount: queueStatus.messageCount }),
      )
      return queueStatus.messageCount
    } catch (err) {
      logger.error(`Failed to get message count for queue "${queueName}"`, llo({ err }))
      return null
    }
  },
}

export default RabbitMQ
