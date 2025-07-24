import Utils from '@helpers/utils'
import { EnumConnection, type IService } from '@types'
import AdminApp from '@admin-api/app'
import config from '@config'

const AragonAdminAPIService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    return await AdminApp()
  },

  stop: Utils.noop,
}

export default AragonAdminAPIService
