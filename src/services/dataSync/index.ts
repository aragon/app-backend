import { EnumConnection, type IService } from '@types'
import config from '@config'
import Utils from '@helpers/utils'
import { SyncDao } from '@services/dataSync/syncDao'
import { SyncToken } from '@services/dataSync/syncToken'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'service:dataSync' })

const DataSync: IService & { repeaters: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],
  repeaters: {},

  async start() {
    logger.info('DataSync service start', llo({}))

    DataSync.repeaters.daos = Utils.setIntervalAsync(
      SyncDao.fetchAll,
      config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      (error: any): void => {
        logger.error('Sync dao error', llo({ error }))
      },
    )

    DataSync.repeaters.tokens = Utils.setIntervalAsync(
      SyncToken.fetchAll,
      config.SERVICES.SYNC_DATA.TOKEN_INTERVAL,
      (error: any): void => {
        logger.error('Sync token error', llo({ error }))
      },
    )
  },

  async stop() {
    await Promise.all(
      Object.keys(DataSync.repeaters).map(async key => {
        if (typeof DataSync.repeaters[key] === 'function') {
          await DataSync.repeaters[key](true)
          delete DataSync.repeaters[key]
        }
      }),
    )

    logger.info('DataSync service stopped', llo({}))
  },
}

export default DataSync
