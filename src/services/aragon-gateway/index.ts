import logger from '@logger'
import {
  EnumConnection,
  EnumQueueName,
  type IGetGaugeEpochId,
  type IMerkleProofSync,
  type IQueueCanCreateProposal,
  type IQueueContractInfo,
  type IQueueMemberBalanceInfo,
  type IRawAction,
  type IService,
} from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { MemberInfo } from '@services/aragon-gateway/memberInfo'
import ActionDecoder from '@services/aragon-gateway/actionDecoder'
import config from '@config'
import Plugin from '@services/aragon-gateway/plugin'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { CapitalDistributorGateway } from '@services/aragon-gateway/capitalDistributor'

const llo = logger.logMeta.bind(null, { service: 'service:GatewayService' })

const AragonGatewayService: IService = {
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

    await RabbitMQHelper.process(EnumQueueName.canCreateProposal, async (job: any) => {
      const { pluginAddress, memberAddress, network } = job.params as IQueueCanCreateProposal
      return await MemberInfo.canCreateProposal(pluginAddress, memberAddress, network)
    })

    await RabbitMQHelper.process(EnumQueueName.pluginInstallationData, async (job: any) => {
      const { address, network } = job.params as IQueueContractInfo
      return await Plugin.getInstallationData(address, network)
    })

    await RabbitMQHelper.process(EnumQueueName.getTokenStats, async (job: { params: IQueueContractInfo }) => {
      return await ProxyWeb3Provider.getTokenCounters({
        address: job.params.address,
        network: job.params.network,
      })
    })

    await RabbitMQHelper.process(EnumQueueName.syncMerkleProofs, async (job: { params: IMerkleProofSync }) => {
      await CapitalDistributorGateway.generateMerkleData(job.params)
    })

    await RabbitMQHelper.process(EnumQueueName.gaugeEpochId, async (job: { params: IGetGaugeEpochId }) => {
      return await Plugin.getGaugeEpochId(job.params.pluginAddress, job.params.network)
    })

    logger.info('AragonGatewayService service started', llo({}))
  },

  async stop() {
    logger.info('AragonGatewayService service stopped', llo({}))
  },
}

export default AragonGatewayService
