import { EnumConnection, type IService, NetworksEnum } from '@types'
import QueueAdminController from '@admin-api/controllers/queue'

export const Queue: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.RABBITMQ],

  start: async () => {
    const daoAddress = ''
    const network = NetworksEnum.zksyncMainnet
    await QueueAdminController.queuePlugins({ address: daoAddress, network })
    await QueueAdminController.queueDaoTransactions({ daoAddress, network })
    await QueueAdminController.queueDaoAssets({ address: daoAddress, network })
  },

  stop: async () => {},
}

export default Queue
