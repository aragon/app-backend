// import amqp, { type Replies, type Connection, type Channel } from 'amqplib'
// import config from '@config'
// import logger from '@logger'
// import { EnumQueueName } from '@types'
//
// const llo = logger.logMeta.bind(null, { service: 'rabbitmq' })
//
// const RabbitMQ = {
//   connection: null as Connection | null,
//   channel: null as Channel | null,
//   reconnectTimer: null as NodeJS.Timeout | null,
//   isReconnecting: false,
//
//   /**
//    * Establish a connection and channel.
//    * Attaches event handlers to auto-reconnect on failure.
//    */
//   async connect(): Promise<void> {
//     // If already connected or reconnecting, skip re-connecting
//     if (RabbitMQ.isConnected()) {
//       logger.verbose('RabbitMQ: Already connected', llo({}))
//       return
//     }
//     if (RabbitMQ.isReconnecting) {
//       logger.verbose('RabbitMQ: Reconnect attempt already in progress', llo({}))
//       return
//     }
//
//     RabbitMQ.isReconnecting = true
//
//     try {
//       RabbitMQ.connection = await amqp.connect(config.RABBITMQ.URI)
//
//       // Listen for connection-level errors/closures
//       RabbitMQ.connection.on('close', async err => RabbitMQ.handleCloseOrError('Connection closed', err))
//       RabbitMQ.connection.on('error', async err => RabbitMQ.handleCloseOrError('Connection error', err))
//
//       RabbitMQ.channel = await RabbitMQ.connection.createChannel()
//
//       // Listen for channel-level errors/closures
//       RabbitMQ.channel.on('close', async err => RabbitMQ.handleCloseOrError('Channel closed', err))
//       RabbitMQ.channel.on('error', async err => RabbitMQ.handleCloseOrError('Channel error', err))
//
//       if (config.RABBITMQ.CLEAN_QUEUE) {
//         await RabbitMQ.cleanAllQueues()
//       }
//
//       RabbitMQ.isReconnecting = false
//       logger.info('RabbitMQ connected', llo({ url: config.RABBITMQ.URI }))
//     } catch (err) {
//       RabbitMQ.isReconnecting = false
//       logger.error('RabbitMQ connection error', llo({ err }))
//       RabbitMQ.scheduleReconnect()
//     }
//   },
//
//   /**
//    * Handle any close/error event by force-closing everything and scheduling a reconnect.
//    */
//   async handleCloseOrError(reason: string, err: unknown) {
//     logger.error(`[RabbitMQ] ${reason}`, llo({ err }))
//     await RabbitMQ.forceClose()
//     RabbitMQ.scheduleReconnect()
//   },
//
//   /**
//    * Schedule a reconnect with a delay, avoiding repeated timers.
//    */
//   scheduleReconnect() {
//     // If there's already a timer set, do nothing
//     if (RabbitMQ.reconnectTimer) {
//       logger.error('RabbitMQ reconnectTimer should be false', llo({ reconnectTimer: RabbitMQ.reconnectTimer }))
//       return
//     }
//
//     const delay = config.RABBITMQ.RECONNECT_TIME || 5000
//     RabbitMQ.reconnectTimer = setTimeout(async () => {
//       RabbitMQ.reconnectTimer = null
//       try {
//         await RabbitMQ.connect()
//         logger.verbose('RabbitMQ connected', llo({}))
//       } catch (reconnectErr) {
//         logger.error('RabbitMQ reconnection attempt failed', llo({ reconnectErr }))
//         RabbitMQ.scheduleReconnect()
//       }
//     }, delay)
//   },
//
//   /**
//    * Clean up all specified queues by purging their messages.
//    */
//   async cleanAllQueues(): Promise<void> {
//     try {
//       if (!RabbitMQ.channel) {
//         logger.warn('Cannot clean queues: Channel is not available', llo())
//         return
//       }
//
//       for (const queueName of Object.values(EnumQueueName)) {
//         await RabbitMQ?.channel?.purgeQueue(queueName)
//         logger.info(`Queue "${queueName}" has been purged`, llo({ queueName }))
//       }
//     } catch (err) {
//       logger.error('Failed to clean RabbitMQ queues', llo({ err }))
//     }
//   },
//
//   /**
//    * Close the channel and connection, and clear any scheduled reconnect.
//    */
//   async forceClose(): Promise<void> {
//     if (RabbitMQ.reconnectTimer) {
//       clearTimeout(RabbitMQ.reconnectTimer)
//       RabbitMQ.reconnectTimer = null
//     }
//
//     // Close channel
//     try {
//       if (RabbitMQ.channel) {
//         await RabbitMQ.channel.close()
//       }
//     } catch (_) {
//       // Ignore
//     } finally {
//       RabbitMQ.channel = null
//     }
//
//     // Close connection
//     try {
//       if (RabbitMQ.connection) {
//         await RabbitMQ.connection.close()
//       }
//     } catch (err) {
//       // Ignore
//     } finally {
//       RabbitMQ.connection = null
//     }
//   },
//
//   /**
//    * Graceful shutdown, e.g., on server stop.
//    */
//   async close(): Promise<void> {
//     await RabbitMQ.forceClose()
//     logger.verbose('RabbitMQ disconnected', llo({}))
//   },
//
//   /**
//    * Check if both connection and channel are established.
//    */
//   isConnected(): boolean {
//     return !!RabbitMQ.connection && !!RabbitMQ.channel
//   },
//
//   /**
//    * Returns the existing channel (null if not connected).
//    */
//   getChannel(): Channel | null {
//     return RabbitMQ.channel || null
//   },
//
//   async getMessageCount(queueName: string): Promise<number | null> {
//     if (!RabbitMQ.channel) {
//       logger.warn('Cannot get message count: Channel is not available', llo())
//       return null
//     }
//
//     try {
//       const queueStatus: Replies.AssertQueue = await RabbitMQ.channel.checkQueue(queueName)
//       logger.info(
//         `Queue "${queueName}" has ${queueStatus.messageCount} messages`,
//         llo({
//           queueName,
//           messageCount: queueStatus.messageCount,
//         }),
//       )
//       return queueStatus.messageCount
//     } catch (err) {
//       logger.error(`Failed to get message count for queue "${queueName}"`, llo({ err }))
//       return null
//     }
//   },
// }
//
// export default RabbitMQ
