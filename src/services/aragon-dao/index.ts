import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  type IQueueAllMetrics,
  type IQueueContractInfo,
  type IQueueDao,
  type IQueueMemberBalanceInfo,
  type IQueueProposalMetrics,
  type IQueueVoteInfo,
  type IRawAction,
  type IService,
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

    // await RabbitMQHelper.process(EnumQueueName.tokenInfo, async (job: any) => {
    //   const { address, network } = job.params as IQueueContractInfo
    //   await TokenInfo.update(address, network)
    // })

    logger.info('AragonDaoService service started', llo({}))
  },

  async stop() {
    logger.info('AragonDaoService service stopped', llo({}))
  },
}

export default AragonDaoService
