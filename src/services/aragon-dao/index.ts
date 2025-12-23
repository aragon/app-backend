import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import {
  EnumConnection,
  EnumQueueName,
  EnumServiceName,
  type IProposalInfo,
  type IQueueAllMetrics,
  type IQueueDao,
  type IQueueDaoTransactions,
  type IQueueProposalMetrics,
  type IService,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:DaoService' })

const AragonDaoService: IService = {
  name: EnumServiceName.ARAGON_DAO,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.allMetrics, async job => {
      const { network } = job.params as IQueueAllMetrics
      await AllMetrics.start({ network })
    })

    await RabbitMQHelper.process(EnumQueueName.daoTransactions, async job => {
      const { daoAddress, network, reset } = job.params as IQueueDaoTransactions

      await DaoTransactions.start({ daoAddress, network, reset })
    })

    await RabbitMQHelper.process(EnumQueueName.daoAssets, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoAssets.start({ daoAddress: address, network })
    })

    await RabbitMQHelper.process(EnumQueueName.daoMetrics, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoMetrics.start({ daoAddress: address, network })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalMultisigMetrics, async job => {
      const { proposalIndex, pluginAddress, network } = job.params as IQueueProposalMetrics

      await ProposalMetrics.proposalMultisigMetrics({ proposalIndex, pluginAddress, network })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalTokenVotingMetrics, async job => {
      const { proposalIndex, pluginAddress, network } = job.params as IQueueProposalMetrics
      await ProposalMetrics.proposalTokenVotingMetrics({ proposalIndex, pluginAddress, network })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalActions, async (job: any) => {
      const { id } = job.params as IProposalInfo
      return await ActionDecoder.proposalActionDecoder(id)
    })

    logger.info('AragonDaoService service started', llo({}))
  },

  async stop() {
    logger.info('AragonDaoService service stopped', llo({}))
  },
}

export default AragonDaoService
