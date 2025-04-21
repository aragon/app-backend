import { connect, type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager'
import { type ConfirmChannel } from 'amqplib'
import config from '@config'
import logger from '@logger'
import { EnumQueueName } from '@types'

const llo = logger.logMeta.bind(null, { service: 'rabbitmq' })

const RabbitMQ = {
  connection: null as AmqpConnectionManager | null,
  channelsMap: new Map<EnumQueueName, ChannelWrapper>(),

  async connect(): Promise<boolean> {
    return await new Promise((resolve, _reject) => {
      // Avoid re-connecting if already connected
      if (RabbitMQ.connection) resolve(true)

      RabbitMQ.connection = connect([config.RABBITMQ.URI], {
        heartbeatIntervalInSeconds: 5,
        reconnectTimeInSeconds: 5,
        connectionOptions: {
          noDelay: true, // disable Nagle
          keepAlive: true, // socket.setKeepAlive(true,…)
          keepAliveDelay: 60000,
          timeout: 10000,
        },
      })

      RabbitMQ.connection.on('connect', () => {
        logger.info('RabbitMQ connected', llo({ uri: config.RABBITMQ.URI }))
        resolve(true)
      })
      RabbitMQ.connection.on('disconnect', err => {
        logger.error('RabbitMQ disconnected', llo({ reason: err }))
        resolve(false)
      })

      // For each queue in EnumQueueName, create a dedicated channel wrapper
      for (const queueName of Object.values(EnumQueueName)) {
        const channelWrapper = RabbitMQ.connection.createChannel({
          json: true,
          confirm: true,
          setup: async (channel: ConfirmChannel) => {
            try {
              await channel.assertQueue(queueName, { durable: true })
              logger.verbose('Channel set up for queue', llo({ queueName }))
            } catch (err) {
              logger.error('Failed to set up channel for queue', llo({ queueName, err }))
              throw err
            }
          },
        })

        RabbitMQ.channelsMap.set(queueName, channelWrapper)
      }
    })
  },

  getChannel(queueName: EnumQueueName): ChannelWrapper {
    if (!RabbitMQ.connection) {
      throw new Error('RabbitMQ is not connected. Call RabbitMQ.connect() first.')
    }
    const cw = RabbitMQ.channelsMap.get(queueName)
    if (!cw) {
      throw new Error(`No channel found for queue "${queueName}"`)
    }
    return cw
  },

  async close(): Promise<void> {
    if (RabbitMQ.connection) {
      try {
        await RabbitMQ.connection.close()
        logger.verbose('RabbitMQ connection closed', llo({}))
      } catch (err) {
        logger.warn('Error closing RabbitMQ connection', llo({ err }))
      } finally {
        RabbitMQ.connection = null
      }
    }
  },
}

export default RabbitMQ
