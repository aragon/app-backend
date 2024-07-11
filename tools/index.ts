import { EnumConnection, type IService } from '@types'

export const Tools: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {},

  stop: async () => {},
}

export default Tools
