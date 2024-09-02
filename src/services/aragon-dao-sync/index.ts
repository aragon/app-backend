import logger from '@logger'
import { EnumConnection, EnumQueueName, type IService } from '@types'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { DaoAssets } from '@services/aragon-dao-sync/daoAssets'
import { DaoTransactions } from '@services/aragon-dao-sync/daoTransactions'

const llo = logger.logMeta.bind(null, { service: 'service:DaoSyncService' })

const DaoSyncService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.daoTransactions, 10, async job => {
      const { address, network } = job.params

      await DaoAssets.start({ daoAddress: address, network })
      logger.verbose('process dao.transactions', llo({ id: job.id }))
    })

    await RabbitMQHelper.process(EnumQueueName.daoAssets, 10, async job => {
      const { address, network } = job.params

      await DaoTransactions.start({ daoAddress: address, network })
      logger.verbose('process dao.assets', llo({ id: job.id }))
    })

    logger.info('DaoSyncService service started', llo({}))
  },

  async stop() {
    logger.info('DaoSyncService service stopped', llo({}))
  },
}

export default DaoSyncService
