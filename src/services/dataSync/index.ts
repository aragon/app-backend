import { type IService } from '@types'
import config from '@config'
import Utils from '@helpers/utils'
import { SyncDao } from '@services/dataSync/syncDao'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'service:dataSync' })

const DataSync: IService & { repeaters: any } = {
  NEED_CONNECTIONS: ['mongodb'],
  repeaters: {},

  async start() {
    logger.info('DataSync service start', llo({}))

    DataSync.repeaters.daos = Utils.setIntervalAsync(
      SyncDao.fetchAll,
      config.SERVICES.SYNC_DAO.INTERVAL,
      (error: any): void => {
        logger.error('Sync dao error', llo({ error }))
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
