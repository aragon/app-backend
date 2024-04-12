import Utils from '@helpers/utils'
import { EnumConnection, type IService } from '@types'
import app from '@services/api/app'

const APIService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  async start() {
    return await app()
  },

  stop: Utils.noop,
}

export default APIService
