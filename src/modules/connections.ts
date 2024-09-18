import Utils from '@helpers/utils'
import logger from '@logger'
import MongoDB from './mongo'
import ProviderModule from '@modules/provider'
import { throwError } from '@errors'
import { EnumConnection } from '@types'
import RabbitMQ from '@modules/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'connection' })

const Connections = {
  openedConnections: [] as EnumConnection[],

  async open(needConnections: EnumConnection[]): Promise<any> {
    return Utils.asyncForEach(needConnections, async (connection: EnumConnection) => {
      try {
        if (!connection || Connections.openedConnections.find(c => c === connection)) {
          await Promise.resolve()
          return
        }

        Connections.openedConnections.push(connection)

        switch (connection) {
          case EnumConnection.MONGODB: {
            await MongoDB.connect()
            return true
          }
          case EnumConnection.BLOCKCHAIN: {
            await ProviderModule.connectToAllNetworks()
            return true
          }
          case EnumConnection.RABBITMQ: {
            await RabbitMQ.connect()
            return true
          }
          default: {
            Connections.openedConnections.pop()
            throwError('Unknown service to connect to')
          }
        }
      } catch (err: any) {
        err.connection = connection
        throw err
      }
    })
      .then(() => {
        logger.verbose('Connections open', llo({}))
        return true
      })
      .catch((error: any) => {
        Connections.openedConnections.pop()
        logger.warn('Unable to open connections', llo({ error }))
        throw error
      })
  },

  async close(): Promise<any> {
    return Utils.asyncForEach(Connections.openedConnections, async (connection: EnumConnection) => {
      switch (connection) {
        case EnumConnection.MONGODB: {
          await MongoDB.disconnect()
          return
        }
        case EnumConnection.BLOCKCHAIN: {
          await ProviderModule.closeAllNetworks()
          return true
        }
        case EnumConnection.RABBITMQ: {
          await RabbitMQ.close()
          return true
        }
        default: {
          throw new Error('Unknown service to disconnect from')
        }
      }
    })
      .then(async () => {
        Connections.openedConnections = []
        logger.verbose('Connections closed', llo({}))
        logger.purge()
        await Utils.wait(500)
      })
      .catch((error: any) => {
        logger.error('Unable to close connections', llo({ error }))
        throw error
      })
  },
}

export default Connections
