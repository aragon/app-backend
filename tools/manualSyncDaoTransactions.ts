import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import type Dao from '@models/schema/dao'

export const ToolsManualSyncDaoTransactions: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const daos = await Models.Dao.find()

    await Promise.all(
      daos.map(async (dao: Dao) => {
        await DaoTransactions.start({ daoAddress: dao.address, network: dao.network })
      }),
    )
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoTransactions
