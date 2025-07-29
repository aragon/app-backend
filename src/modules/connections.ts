import Utils from '@helpers/utils'
import logger from '@logger'
import MongoDB from './mongo'
import ProviderModule from '@modules/provider'
import { throwError } from '@errors'
import { EnumConnection, type IOptionService } from '@types'
import RabbitMQ from '@modules/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'Connections' })

const Connections = {
  openedConnections: [] as EnumConnection[],

  async open(needConnections: EnumConnection[], options?: IOptionService): Promise<any> {
    const failedConnections: EnumConnection[] = []

    try {
      await Utils.asyncForEach(needConnections, async (connection: EnumConnection) => {
        try {
          // Skip if connection is invalid or already opened
          if (!connection || Connections.openedConnections.includes(connection)) {
            return
          }

          logger.verbose('Opening connection', llo({ connection }))

          switch (connection) {
            case EnumConnection.MONGODB: {
              await MongoDB.connect(options)
              Connections.openedConnections.push(connection)
              break
            }
            case EnumConnection.BLOCKCHAIN: {
              await ProviderModule.connectToAllNetworks()
              Connections.openedConnections.push(connection)
              break
            }
            case EnumConnection.RABBITMQ: {
              await RabbitMQ.connect()
              Connections.openedConnections.push(connection)
              break
            }
            default: {
              throwError(`Unknown connection type: ${connection}`)
            }
          }

          logger.verbose('Connection opened successfully', llo({ connection }))
        } catch (err: any) {
          failedConnections.push(connection)
          err.connection = connection
          throw err
        }
      })

      logger.info(
        'All connections opened',
        llo({
          opened: Connections.openedConnections,
          total: needConnections.length,
        }),
      )
      return true
    } catch (error: any) {
      // Close any connections that were successfully opened
      await Connections.closeSpecific(Connections.openedConnections)

      logger.error(
        'Unable to open connections',
        llo({
          error: error.message || error,
          failed: failedConnections,
          opened: Connections.openedConnections,
        }),
      )
      throw error
    }
  },

  async close(): Promise<any> {
    if (Connections.openedConnections.length === 0) {
      logger.verbose('No connections to close', llo({}))
      return
    }

    const connectionsToClose = [...Connections.openedConnections]

    try {
      await Connections.closeSpecific(connectionsToClose)
      logger.verbose('All connections closed', llo({}))
      logger.purge()
      await Utils.wait(500)
    } catch (error: any) {
      logger.error('Error closing connections', llo({ error }))
      throw error
    }
  },

  async closeSpecific(connections: EnumConnection[]): Promise<void> {
    const errors: Array<{ connection: EnumConnection; error: any }> = []

    await Utils.asyncForEach(connections, async (connection: EnumConnection) => {
      try {
        switch (connection) {
          case EnumConnection.MONGODB: {
            await MongoDB.disconnect()
            break
          }
          case EnumConnection.BLOCKCHAIN: {
            await ProviderModule.closeAllNetworks()
            break
          }
          case EnumConnection.RABBITMQ: {
            await RabbitMQ.close()
            break
          }
          default: {
            logger.warn('Unknown connection type to disconnect', llo({ connection }))
          }
        }

        // Remove from opened connections
        const index = Connections.openedConnections.indexOf(connection)
        if (index > -1) {
          Connections.openedConnections.splice(index, 1)
        }

        logger.verbose('Connection closed', llo({ connection }))
      } catch (error: any) {
        errors.push({ connection, error })
        logger.error('Failed to close connection', llo({ connection, error }))
      }
    })

    if (errors.length > 0) {
      throw new Error(`Failed to close connections: ${errors.map(e => e.connection).join(', ')}`)
    }
  },

  /**
   * Check if a specific connection is open
   */
  isOpen(connection: EnumConnection): boolean {
    return Connections.openedConnections.includes(connection)
  },

  /**
   * Get all open connections
   */
  getOpenConnections(): EnumConnection[] {
    return [...Connections.openedConnections]
  },

  /**
   * Health check for all connections
   */
  async healthCheck(): Promise<Record<EnumConnection, boolean>> {
    const health: Record<EnumConnection | any, boolean> = {}

    for (const connection of Connections.openedConnections) {
      try {
        switch (connection) {
          case EnumConnection.MONGODB:
            health[connection] = MongoDB.isConnected()
            break
          case EnumConnection.BLOCKCHAIN:
            // Add blockchain health check if available
            health[connection] = true
            break
          case EnumConnection.RABBITMQ:
            health[connection] = RabbitMQ.isConnected()
            break
        }
      } catch (error) {
        health[connection] = false
      }
    }

    return health as Record<EnumConnection, boolean>
  },
}

export default Connections
