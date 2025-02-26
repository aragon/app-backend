import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import type Dao from '@models/schema/dao'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'tools:manualSyncDaoTransactions' })

export const ToolsManualSyncDaoTransactions: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const daos = await Models.Dao.find()

    await Promise.all(
      daos.map(async (dao: Dao) => {
        const configIndexer = await Models.ConfigIndexer.find({
          service: { $regex: `(deposit|withdraw)-${daos}` },
        })

        for (const config of configIndexer) {
          await config.update({ lastSync: dao.blockNumber })
        }

        await DaoTransactions.start({ daoAddress: dao.address, network: dao.network })
        logger.verbose('End manualSyncDaoTransactions', llo({ daoId: dao.id, daoAddress: dao.address }))
      }),
    )
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoTransactions
