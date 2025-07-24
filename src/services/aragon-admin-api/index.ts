import Utils from '@helpers/utils'
import { EnumConnection, type IService } from '@types'
import AdminApp from '@admin-api/app'

const AragonAdminAPIService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],
  options: { mongoSync: false },

  async start() {
    return await AdminApp()
  },

  stop: Utils.noop,
}

export default AragonAdminAPIService
