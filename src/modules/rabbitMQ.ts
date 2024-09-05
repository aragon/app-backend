import amqp, { type Channel, type Connection } from 'amqplib'
import config from '@config'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'rabbitmq' })

const RabbitMQ = {
  connection: null as Connection | null,
  channel: null as Channel | null,

  async connect(): Promise<void> {
    if (RabbitMQ.connection && RabbitMQ.channel) {
      logger.verbose('RabbitMQ already connected', llo({}))
      return
    }

    try {
      RabbitMQ.connection = await amqp.connect(config.RABBITMQ.URI)
      RabbitMQ.channel = await RabbitMQ.connection.createChannel()

      logger.info('RabbitMQ connected', llo({ url: config.RABBITMQ.URI }))
    } catch (error) {
      logger.error('RabbitMQ connection error', llo({ error }))
      throw error
    }
  },

  getChannel(): Channel | null {
    return RabbitMQ.channel
  },

  async close(): Promise<void> {
    try {
      if (RabbitMQ.channel) {
        await RabbitMQ.channel.close()
        RabbitMQ.channel = null
      }

      if (RabbitMQ.connection) {
        await RabbitMQ.connection.close()
        RabbitMQ.connection = null
      }

      logger.verbose('RabbitMQ disconnected', llo({}))
    } catch (error) {
      logger.error('RabbitMQ disconnection error', llo({ error }))
      throw error
    }
  },
}

export default RabbitMQ
