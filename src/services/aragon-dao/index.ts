import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  type IQueueContractInfo,
  type IQueueDao,
  type IQueueMemberBalanceInfo,
  type IQueueProposalMetrics,
  type IQueueVoteInfo,
  type IService,
} from '@types'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import getContractInfo from '@services/aragon-dao/contractInfo'
import VoteInfo from '@services/aragon-dao/voteInfo'
import MemberInfo from '@services/aragon-dao/memberInfo'

const llo = logger.logMeta.bind(null, { service: 'service:DaoService' })

const DaoSyncService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.daoTransactions, 10, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoTransactions.start({ daoAddress: address, network })
    })

    await RabbitMQHelper.process(EnumQueueName.daoAssets, 10, async job => {
      const { address, network } = job.params as IQueueDao

      await DaoAssets.start({ daoAddress: address, network })
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

    await RabbitMQHelper.process(EnumQueueName.contractInfo, 10, async (job: any) => {
      const { address, network } = job.params as IQueueContractInfo
      return await getContractInfo(network, address)
    })

    await RabbitMQHelper.process(EnumQueueName.voteInfo, 10, async (job: any) => {
      const { proposalId, userAddress } = job.params as IQueueVoteInfo
      return await VoteInfo.getVoteInfo({ proposalId, userAddress })
    })

    await RabbitMQHelper.process(EnumQueueName.memberBalance, 10, async (job: any) => {
      const { userAddress, tokenAddress, network } = job.params as IQueueMemberBalanceInfo
      return await MemberInfo.getByTokenAddress(userAddress, tokenAddress, network)
    })

    logger.info('DaoSyncService service started', llo({}))
  },

  async stop() {
    logger.info('DaoSyncService service stopped', llo({}))
  },
}

export default DaoSyncService
