import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  type IGetVotingPower,
  type IProposalInfo,
  type IQueueAllMetrics,
  type IQueueCanCreateProposal,
  type IQueueContractInfo,
  type IQueueDao,
  type IQueueMemberBalanceInfo,
  type IQueueProposalMetrics,
  type IQueueVoteInfo,
  type IRawAction,
  type IService,
  type IGetLockVotingPowerBatch,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { ContractInfo } from '@services/aragon-dao/contractInfo'
import { VoteInfo } from '@services/aragon-dao/voteInfo'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import ActionDecoder from '@services/aragon-dao/actionDecoder'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import config from '@config'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import TokenFetcher from '@services/aragon-dao/tokenFetcher'
import Plugin from '@services/aragon-dao/plugin'

const llo = logger.logMeta.bind(null, { service: 'service:DaoService' })

const AragonDaoService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.allMetrics, async job => {
      const { network } = job.params as IQueueAllMetrics
      await AllMetrics.start({ network })
    })

    await RabbitMQHelper.process(EnumQueueName.daoTransactions, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoTransactions.start({ daoAddress: address, network })
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

    await RabbitMQHelper.process(EnumQueueName.contractInfo, async (job: any) => {
      const { address, network } = job.params as IQueueContractInfo
      return await ContractInfo.getContractInfo(network, address)
    })

    await RabbitMQHelper.process(EnumQueueName.getVotingPower, async (job: any) => {
      const { userAddress, tokenAddress, network } = job.params as IGetVotingPower
      return await MemberInfo.getVotingPower(userAddress, tokenAddress, network)
    })

    await RabbitMQHelper.process(EnumQueueName.getLockVotingPowerBatch, async (job: any) => {
      const { locks } = job.params as IGetLockVotingPowerBatch
      return await MemberInfo.getLockVotingPowerBatch(locks)
    })

    await RabbitMQHelper.process(EnumQueueName.voteInfo, async (job: any) => {
      const { proposalId, userAddress } = job.params as IQueueVoteInfo
      return await VoteInfo.getVoteInfo({ proposalId, userAddress })
    })

    await RabbitMQHelper.process(EnumQueueName.memberBalance, async (job: any) => {
      const { userAddress, tokenAddress, network, pluginAddress } = job.params as IQueueMemberBalanceInfo
      return await MemberInfo.getByTokenAddress(userAddress, pluginAddress, tokenAddress, network)
    })

    await RabbitMQHelper.process(EnumQueueName.contractDecoder, async (job: any) => {
      const { from, to, data, value, network } = job.params as IRawAction
      return await ActionDecoder.decode({ from, to, data, value, network })
    })

    await RabbitMQHelper.process(EnumQueueName.proposalActions, async (job: any) => {
      const { id } = job.params as IProposalInfo
      return await ActionDecoder.proposalActionDecoder(id)
    })

    await RabbitMQHelper.process(EnumQueueName.canCreateProposal, async (job: any) => {
      const { pluginAddress, memberAddress, network } = job.params as IQueueCanCreateProposal
      return await MemberInfo.canCreateProposal(pluginAddress, memberAddress, network)
    })

    await RabbitMQHelper.process(EnumQueueName.pluginInstallationData, async (job: any) => {
      const { address, network } = job.params as IQueueContractInfo
      return await Plugin.getInstallationData(address, network)
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
