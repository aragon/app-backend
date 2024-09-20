import { EnumConnection, type IService } from '@types'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { Models } from '@dbModels'

export const ToolsManualSyncDaoAssets: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const daos = await Models.Dao.find()

    for (const dao of daos) {
      await DaoAssets.start({ daoAddress: dao.address, network: dao.network })
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncDaoAssets
