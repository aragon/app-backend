import Utils from '@helpers/utils'
import { EnumConnection, type IService } from '@types'
import App from '@services/aragon-api/app'
import config from '@config'

const AragonAPIService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  async start() {
    return await App()
  },

  stop: Utils.noop,
}

export default AragonAPIService
