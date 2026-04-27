import config from '@config'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import AuditRunner from '@modules/audit/runner'
import GaugeRewardDistribution from '@modules/gaugeRewardDistribution'
import GovernanceRewards from '@modules/governanceRewards'
import { ProxyToken } from '@modules/proxyToken'
import VeRewardDistribution from '@modules/veRewardDistribution'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { GaugeInfo } from '@services/aragon-gateway/gauge'
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
  type IGetGovernanceRewardDistribution,
  type IMerkleProofSync,
  type IQueueAuditProposal,
  type IQueueCanCreateProposal,
  type IQueueContractDecoderLight,
  type IQueueContractInfo,
  type IQueueMemberBalanceInfo,
  type IQueueMetadataRefetch,
  type IQueueTokenInfo,
  type IQueueTokenTotalSupply,
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

    await RabbitMQHelper.process(
      EnumQueueName.gaugeRewardDistributionByGauge,
      async (job: { params: IGetGaugeRewardDistribution }) => {
        const result = await new GaugeRewardDistribution({
          epochId: job.params.epochId,
          pluginAddress: job.params.pluginAddress,
          network: job.params.network,
          rewardTotalAmount: BigInt(job.params.rewardTotalAmount),
        }).compute()

        if (!result) return null
        if ('error' in result) return { error: result.error, errorKey: (result as any).errorKey }

        return {
          epoch: result.epoch,
          pluginAddress: result.pluginAddress,
          network: result.network,
          totalVotingPower: result.totalVotingPower.toString(),
          rewardTotalAmount: result.rewardTotalAmount.toString(),
          gaugeRewards: result.gaugeRewards.map(r => ({
            gauge: r.gauge,
            votingPower: r.votingPower.toString(),
            rewardAmount: r.rewardAmount.toString(),
          })),
        }
      },
    )

    await RabbitMQHelper.process(
      EnumQueueName.governanceRewardDistribution,
      async (job: { params: IGetGovernanceRewardDistribution }) => {
        const result = await new GovernanceRewards({
          pluginAddress: job.params.pluginAddress,
          network: job.params.network,
          totalAmount: BigInt(job.params.rewardTotalAmount),
          lookbackDate: job.params.lookbackDate,
        }).compute()

        if ('error' in result) return { error: result.error }

        return result.map(r => ({
          address: r.address,
          amount: r.amount.toString(),
        }))
      },
    )

    await RabbitMQHelper.process(EnumQueueName.tokenInfo, async (job: { params: IQueueTokenInfo }) => {
      const { address, network, forceUpdate } = job.params
      await ProxyToken.saveAndGetToken(address, network, forceUpdate)
      return true
    })

    await RabbitMQHelper.process(EnumQueueName.metadataRefetch, async (job: { params: IQueueMetadataRefetch }) => {
      return await MetadataRefetchProcessor.processRefetch(job.params)
    })

    await RabbitMQHelper.process(EnumQueueName.tokenTotalSupply, async (job: { params: IQueueTokenTotalSupply }) => {
      const { address, network } = job.params
      const totalSupplyRaw = await Web3Helper.getTokenTotalSupply(address, network)
      const totalSupply = totalSupplyRaw.toString()
      const totalSupplyUpdatedAt = new Date()

      await Models.Token.updateOne({ address, network }, { $set: { totalSupply, totalSupplyUpdatedAt } })

      return { totalSupply, totalSupplyUpdatedAt }
    })

    await RabbitMQHelper.process(EnumQueueName.auditProposal, async (job: { params: IQueueAuditProposal }) => {
      try {
        const { audit } = await AuditRunner.run(job.params)
        return audit
      } catch (err: any) {
        // Log only the error name + a truncated message — runner errors can carry
        // model-controlled / proposal-controlled content that we don't want to leak.
        const message = typeof err?.message === 'string' ? err.message.slice(0, 200) : String(err)
        logger.error('Audit job failed', llo({ ...job.params, errorName: err?.name, message }))
        return { error: 'auditFailed' }
      }
    })

    logger.info('AragonGatewayService service started', llo({}))
  },

  async stop() {
    logger.info('AragonGatewayService service stopped', llo({}))
  },
}

export default AragonGatewayService
