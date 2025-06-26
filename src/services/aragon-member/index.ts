import logger from '@logger'
import { EnumConnection, EnumQueueName, type IQueueSyncMember, type IService } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import SyncMember from '@services/aragon-member/syncMember'

const llo = logger.logMeta.bind(null, { service: 'service:DaoService' })

const AragonDaoService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.syncMember, async job => {
      const { pluginAddress, tokenAddress, network, members } = job.params as IQueueSyncMember

      await SyncMember.process({ pluginAddress, tokenAddress, network, members })
    })

    logger.info('AragonDaoService service started', llo({}))
  },

  async stop() {
    logger.info('AragonDaoService service stopped', llo({}))
  },
}

export default AragonDaoService
