import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  type IProposalInfo,
  type IQueueAllMetrics,
  type IQueueContractInfo,
  type IQueueDao,
  type IQueueDaoTransactions,
  type IQueueProposalMetrics,
  type IService,
  EnumServiceName,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import config from '@config'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import TokenFetcher from '@services/aragon-dao/tokenFetcher'
import ProxyWeb3Provider from '@modules/proxyProvider'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'

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

    await RabbitMQHelper.process(EnumQueueName.getTokenStats, async (job: { params: IQueueContractInfo }) => {
      return await ProxyWeb3Provider.getTokenCounters({
        address: job.params.address,
        network: job.params.network,
      })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalActions, async (job: any) => {
      const { id } = job.params as IProposalInfo
      return await ActionDecoder.proposalActionDecoder(id)
    })

    const tasks = [[{ fetchRates: TokenFetcher }]]

    const taskOptions = {
      fn: () => [...tasks],
      interval: config.SERVICES.ARAGON_DAO.TOKEN_FETCH_INTERVAL,
      checkInterval: config.SERVICES.ARAGON_DAO.TOKEN_FETCH_INTERVAL / 2,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        logger.error('Token Fetcher task error', llo({ error }))
      },
    }

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask('token-re-fetch', taskOptions)

    logger.info('AragonDaoService service started', llo({}))
  },

  async stop() {
    logger.info('AragonDaoService service stopped', llo({}))
  },
}

export default AragonDaoService
