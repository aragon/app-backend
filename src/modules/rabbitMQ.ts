import amqp, { type Connection, type Channel } from 'amqplib'
import config from '@config'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'rabbitmq' })

const RabbitMQ = {
  connection: null as Connection | null,
  channel: null as Channel | null,
  reconnectTimer: null as NodeJS.Timeout | null,
  isReconnecting: false,

  /**
   * Establish a connection and channel.
   * Attaches event handlers to auto-reconnect on failure.
   */
  async connect(): Promise<void> {
    // If already connected or reconnecting, skip re-connecting
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

      // Listen for connection-level errors/closures
      RabbitMQ.connection.on('close', async err => RabbitMQ.handleCloseOrError('Connection closed', err))
      RabbitMQ.connection.on('error', async err => RabbitMQ.handleCloseOrError('Connection error', err))

      RabbitMQ.channel = await RabbitMQ.connection.createChannel()

      // Listen for channel-level errors/closures
      RabbitMQ.channel.on('close', async err => RabbitMQ.handleCloseOrError('Channel closed', err))
      RabbitMQ.channel.on('error', async err => RabbitMQ.handleCloseOrError('Channel error', err))

      logger.info('RabbitMQ connected', llo({ url: config.RABBITMQ.URI }))
    } catch (err) {
      logger.error('RabbitMQ connection error', llo({ err }))
      RabbitMQ.scheduleReconnect()
    } finally {
      RabbitMQ.isReconnecting = false
    }
  },

  /**
   * Handle any close/error event by force-closing everything and scheduling a reconnect.
   */
  async handleCloseOrError(reason: string, err: unknown) {
    logger.error(`[RabbitMQ] ${reason}`, llo({ err }))
    await RabbitMQ.forceClose()
    RabbitMQ.scheduleReconnect()
  },

  /**
   * Schedule a reconnect with a delay, avoiding repeated timers.
   */
  scheduleReconnect() {
    // If there's already a timer set, do nothing
    if (RabbitMQ.reconnectTimer) {
      return
    }

    const delay = config.RABBITMQ.RECONNECT_TIME || 5000
    RabbitMQ.reconnectTimer = setTimeout(async () => {
      RabbitMQ.reconnectTimer = null
      try {
        await RabbitMQ.connect()
      } catch (reconnectErr) {
        logger.error('RabbitMQ reconnection attempt failed', llo({ reconnectErr }))
        RabbitMQ.scheduleReconnect()
      }
    }, delay)
  },

  /**
   * Close the channel and connection, and clear any scheduled reconnect.
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
    } catch (err) {
      logger.error('Error closing channel', llo({ err }))
    } finally {
      RabbitMQ.channel = null
    }

    // Close connection
    try {
      if (RabbitMQ.connection) {
        await RabbitMQ.connection.close()
      }
    } catch (err) {
      logger.error('Error closing connection', llo({ err }))
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
    return RabbitMQ.channel
  },
}

export default RabbitMQ
