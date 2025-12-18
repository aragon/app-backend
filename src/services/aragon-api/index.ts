import config from '@config'
import Utils from '@helpers/utils'
import App from '@services/aragon-api/app'
import { EnumConnection, EnumServiceName, type IService } from '@types'

const AragonAPIService: IService = {
  name: EnumServiceName.ARAGON_API,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    return await App()
  },

  stop: Utils.noop,
}

export default AragonAPIService
