import Utils from '@helpers/utils'
import { EnumConnection, EnumServiceName, type IService } from '@types'
import AdminApp from '@admin-api/app'
import config from '@config'

const AragonAdminAPIService: IService = {
  name: EnumServiceName.ARAGON_ADMIN_API,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    return await AdminApp()
  },

  stop: Utils.noop,
}

export default AragonAdminAPIService
