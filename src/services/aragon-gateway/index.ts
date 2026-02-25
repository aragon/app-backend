import config from '@config'
import GaugeHelper from '@helpers/gauge'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { GaugeInfo } from '@services/aragon-gateway/gauge'
import VeRewardDistribution from '@modules/veRewardDistribution'
import { MemberInfo } from '@services/aragon-gateway/memberInfo'
import { MetadataRefetchProcessor } from '@services/aragon-gateway/metadataRefetch'
import Plugin from '@services/aragon-gateway/plugin'
import {
  EnumConnection,
  EnumQueueName,
  EnumServiceName,
  type IGetGaugeEpochId,
  type IGetGaugeInfoId,
  type IGetGaugeRewardDistribution,
  type IMerkleProofSync,
  type IQueueCanCreateProposal,
  type IQueueContractDecoderLight,
  type IQueueContractInfo,
  type IQueueMemberBalanceInfo,
  type IQueueMetadataRefetch,
  type IQueueTokenInfo,
  type IRawAction,
  type IService,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:GatewayService' })

const AragonGatewayService: IService = {
  name: EnumServiceName.ARAGON_GATEWAY,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  start: async function () {
    await RabbitMQHelper.process(EnumQueueName.contractInfo, async (job: any) => {
      const { address, network } = job.params as IQueueContractInfo
      return await ContractInfo.getContractInfo(network, address)
    })

    await RabbitMQHelper.process(EnumQueueName.memberBalance, async (job: any) => {
      const { userAddress, tokenAddress, network, pluginAddress } = job.params as IQueueMemberBalanceInfo
      return await MemberInfo.getByTokenAddress(userAddress, pluginAddress, tokenAddress, network)
    })

    await RabbitMQHelper.process(EnumQueueName.contractDecoder, async (job: any) => {
      const { from, to, data, value, network } = job.params as IRawAction
      return await ActionDecoder.decode({ from, to, data, value, network })
    })

    await RabbitMQHelper.process(
      EnumQueueName.contractDecoderLight,
      async (job: { params: IQueueContractDecoderLight }) => {
        return await ActionDecoder.decodeLight(job.params)
      },
    )

    await RabbitMQHelper.process(EnumQueueName.canCreateProposal, async (job: any) => {
      const { pluginAddress, memberAddress, network } = job.params as IQueueCanCreateProposal
      return await MemberInfo.canCreateProposal(pluginAddress, memberAddress, network)
    })

    await RabbitMQHelper.process(EnumQueueName.pluginInstallationData, async (job: any) => {
      const { address, network } = job.params as IQueueContractInfo
      return await Plugin.getInstallationData(address, network)
    })

    await RabbitMQHelper.process(EnumQueueName.syncMerkleProofs, async (job: { params: IMerkleProofSync }) => {
      await CapitalDistributorGateway.generateMerkleData(job.params)
    })

    await RabbitMQHelper.process(EnumQueueName.gaugeEpochId, async (job: { params: IGetGaugeEpochId }) => {
      return await GaugeHelper.getGaugeEpochId(job.params.pluginAddress, job.params.network)
    })

    await RabbitMQHelper.process(EnumQueueName.gaugeInfo, async job => {
      const { pluginAddress, memberAddress, network } = job.params as IGetGaugeInfoId
      return await GaugeInfo.getGaugeInfo({ pluginAddress, memberAddress, network })
    })

    await RabbitMQHelper.process(
      EnumQueueName.gaugeRewardDistribution,
      async (job: { params: IGetGaugeRewardDistribution }) => {
        const result = await new VeRewardDistribution({
          epochId: job.params.epochId,
          pluginAddress: job.params.pluginAddress,
          network: job.params.network,
          rewardTotalAmount: BigInt(job.params.rewardTotalAmount),
        }).compute()

        if (!result) return null
        if ('error' in result) return { error: result.error }

        return {
          epoch: result.epoch,
          pluginAddress: result.pluginAddress,
          network: result.network,
          totalVotingPower: result.contractTotal.toString(),
          owners: result.ownerRewards.map(r => ({
            owner: r.owner,
            votingPower: r.votingPower.toString(),
            rewardAmount: r.rewardAmount.toString(),
            tokenIds: r.tokenIds,
          })),
          invariants: result.invariants,
        }
      },
    )

    await RabbitMQHelper.process(EnumQueueName.tokenInfo, async (job: { params: IQueueTokenInfo }) => {
      const { address, network } = job.params
      await ProxyToken.saveAndGetToken(address, network)
      return true
    })

    await RabbitMQHelper.process(EnumQueueName.metadataRefetch, async (job: { params: IQueueMetadataRefetch }) => {
      return await MetadataRefetchProcessor.processRefetch(job.params)
    })

    logger.info('AragonGatewayService service started', llo({}))
  },

  async stop() {
    logger.info('AragonGatewayService service stopped', llo({}))
  },
}

export default AragonGatewayService
