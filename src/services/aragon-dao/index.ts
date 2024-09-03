import logger from '@logger'
import { EnumConnection, EnumQueueName, type IQueueDao, type IQueueProposalMetrics, type IService } from '@types'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'

const llo = logger.logMeta.bind(null, { service: 'service:DaoService' })

const DaoSyncService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.daoTransactions, 10, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoAssets.start({ daoAddress: address, network })
    })

    await RabbitMQHelper.process(EnumQueueName.daoAssets, 10, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoTransactions.start({ daoAddress: address, network })
    })

    await RabbitMQHelper.process(EnumQueueName.daoMetrics, 10, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoMetrics.start({ daoAddress: address, network })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalMultisigMetrics, 10, async job => {
      const { proposalIndex, pluginAddress, network } = job.params as IQueueProposalMetrics

      await ProposalMetrics.proposalMultisigMetrics({ proposalIndex, pluginAddress, network })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalTokenVotingMetrics, 10, async job => {
      const { proposalIndex, pluginAddress, network } = job.params as IQueueProposalMetrics

      await ProposalMetrics.proposalTokenVotingMetrics({ proposalIndex, pluginAddress, network })
    })

    logger.info('DaoSyncService service started', llo({}))
  },

  async stop() {
    logger.info('DaoSyncService service stopped', llo({}))
  },
}

export default DaoSyncService
