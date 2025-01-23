import { EnumConnection, type IService } from '@types'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { Models } from '@dbModels'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

export const ToolsManualSyncDaoAssets: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const daos = await Models.Dao.find({
      address: {
        $in: ['0xE1080Dc81aD0E40D362dBEf14f1F15339a1d015c'],
      },
    })

    for (const dao of daos) {
      await DaoAssets.start({ daoAddress: dao.address, network: dao.network })
      await DaoTransactions.start({ daoAddress: dao.address, network: dao.network })
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoAssets
