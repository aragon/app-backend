import config from '@config'
import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import EventReplayHelper from '@helpers/eventReplay'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import FraudScan from '@modules/fraudDetection/fraudScan'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import { CrossChainGasDao } from '@services/aragon-dao/crossChainGas'
import { DaoAssets } from '@services/aragon-dao/daoAssets'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { SppRuleConditionDao } from '@services/aragon-dao/sppRuleCondition'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import {
  EnumConnection,
  EnumQueueName,
  EnumServiceName,
  type IProposalInfo,
  type IQueueAllMetrics,
  type IQueueCrossChainGasLimit,
  type IQueueDao,
  type IQueueDaoTransactions,
  type IQueueEventReplay,
  type IQueueExecutionActions,
  type IQueueProposalFraudScan,
  type IQueueProposalMetrics,
  type IQueueSppRuleCondition,
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
      const { daoAddress, network, reset, resetExecutions } = job.params as IQueueDaoTransactions

      await DaoTransactions.start({ daoAddress, network, reset, resetExecutions })
    })

    await RabbitMQHelper.process(EnumQueueName.daoAssets, async job => {
      const { address, network, tokenAddress, native } = job.params as IQueueDao

      if (native) {
        await DaoAssets.syncNative({ daoAddress: address, network })
      } else if (tokenAddress) {
        await DaoAssets.syncToken({ daoAddress: address, tokenAddress, network })
      } else {
        await DaoAssets.start({ daoAddress: address, network })
      }
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

    await RabbitMQHelper.process(EnumQueueName.executionActions, async (job: any) => {
      const { id } = job.params as IQueueExecutionActions
      await DaoExecutionHandler.decodeExecutionTransaction(id)
    })

    await RabbitMQHelper.process(EnumQueueName.eventReplay, async (job: any) => {
      const { txHash, network } = job.params as IQueueEventReplay
      await EventReplayHelper.handleEventsFromTxHash(txHash, network)
    })

    await RabbitMQHelper.process(
      EnumQueueName.crossChainGasLimit,
      async (job: { params: IQueueCrossChainGasLimit }) => {
        return await CrossChainGasDao.estimateGasLimit(job.params)
      },
    )

    await RabbitMQHelper.process(EnumQueueName.sppRuleCondition, async (job: { params: IQueueSppRuleCondition }) => {
      return await SppRuleConditionDao.resolve(job.params)
    })

    await RabbitMQHelper.process(EnumQueueName.proposalFraudScan, async job => {
      const { id } = job.params as IQueueProposalFraudScan
      await FraudScan.scanProposal(id)
    })

    logger.info('AragonDaoService service started', llo({}))
  },

  async stop() {
    logger.info('AragonDaoService service stopped', llo({}))
  },
}

export default AragonDaoService
