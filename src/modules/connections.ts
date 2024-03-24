import Utils from '@helpers/utils'
import logger from '@logger'
import MongoDB from './mongo'
import { throwError } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'connection' })

const Connections = {
  openedConnections: [] as string[],

  async open(needConnections: string[]): Promise<any> {
    return Utils.asyncForEach(needConnections, async (connection: string) => {
      try {
        if (!connection || Connections.openedConnections.find(c => c === connection)) {
          await Promise.resolve()
          return
        }

        Connections.openedConnections.push(connection)

        switch (connection) {
          case 'mongodb': {
            await MongoDB.connect()
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
      .catch(error => {
        Connections.openedConnections.pop()
        logger.warn('Unable to open connections', { error })
        throw error
      })
  },

  async close(): Promise<any> {
    return Utils.asyncForEach(Connections.openedConnections, async (connection: string) => {
      switch (connection) {
        case 'mongodb': {
          await MongoDB.disconnect()
          return
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
