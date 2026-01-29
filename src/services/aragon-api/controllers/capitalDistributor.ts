import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import EIP712AuthModule, { EIP712ActionType } from '@modules/eip712Auth'
import { type CapitalDistributorGovernance, MemberGovernanceFactory } from '@src/governance'
import {
  CampaignPrepareStatus,
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type ICampaignApiParams,
  type ICampaignResponse,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginInterfaceType,
  type IUserCampaignStatus,
  type NetworksEnum,
} from '@types'

const CapitalDistributorController = {
  getCampaignsWithPagination: async (
    paginationParams: IPaginationParams,
    params: ICampaignApiParams,
  ): Promise<IPaginatedResult<ICampaignResponse>> => {
    assertExposable(!!params.pluginAddress, ErrorKeyEnum.badParams)
    assertExposable(!!params.network, ErrorKeyEnum.badParams)

    return await Models.Campaign.getCampaignsWithPagination({
      paginationParams,
      params,
    })
  },

  getUserCampaignStatus: async (
    pluginAddress: HexAddress,
    network: NetworksEnum,
    userAddress: HexAddress,
  ): Promise<IUserCampaignStatus> => {
    assertExposable(!!pluginAddress, ErrorKeyEnum.badParams)
    assertExposable(!!network, ErrorKeyEnum.badParams)
    assertExposable(!!userAddress, ErrorKeyEnum.badParams)

    return await Models.CampaignReward.getUserCampaignStatus(pluginAddress, network, userAddress)
  },

  getUserCampaignReward: async (params: {
    campaignId: string
    userAddress: HexAddress
    pluginAddress: HexAddress
    network: NetworksEnum
  }): Promise<any> => {
    const { campaignId, userAddress, pluginAddress, network } = params
    const governance = MemberGovernanceFactory.create({
      address: pluginAddress,
      network,
      interfaceType: IPluginInterfaceType.capitalDistributor,
    }) as CapitalDistributorGovernance
    return await governance.getUserCampaignReward({ campaignId, userAddress })
  },

  getPrepareMessage: async (params: { daoAddress: HexAddress; network: NetworksEnum }) => {
    const { daoAddress, network } = params

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const { typedData, nonce, expiresAt } = await EIP712AuthModule.generateMessage({
      daoAddress,
      network,
      action: EIP712ActionType.prepareCampaign,
    })

    return { typedData, nonce, expiresAt }
  },

  prepareCampaignFromGauge: async (params: {
    daoAddress: HexAddress
    network: NetworksEnum
    gaugePluginAddress: HexAddress
    capitalDistributorAddress: HexAddress
    tokenAddress: HexAddress
    totalAmount: string
    metadataUri: string
    epochId?: string
    nonce: string
    signature: string
  }): Promise<{ prepareId: string; status: CampaignPrepareStatus }> => {
    const {
      daoAddress,
      network,
      gaugePluginAddress,
      capitalDistributorAddress,
      tokenAddress,
      totalAmount,
      metadataUri,
      nonce,
      signature,
    } = params

    const authResult = await EIP712AuthModule.verifyAndConsume({
      daoAddress,
      network,
      nonce,
      signature,
      action: EIP712ActionType.prepareCampaign,
    })

    assertExposable(authResult.valid, ErrorKeyEnum.unauthorized)

    const memberCheck = await EIP712AuthModule.checkMultisigMember({
      signer: authResult.signer!,
      daoAddress,
      network,
    })
    assertExposable(memberCheck.authorized, ErrorKeyEnum.unauthorized)

    assertExposable(BigInt(totalAmount) > 0n, ErrorKeyEnum.badParams)

    const [dao, gaugePlugin, capitalDistributorPlugin] = await Promise.all([
      Models.Dao.findByAddress(daoAddress, network),
      Models.Plugin.findOne({
        address: gaugePluginAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.gauge,
      }),
      Models.Plugin.findOne({
        address: capitalDistributorAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      }),
    ])

    assertExposable(dao, ErrorKeyEnum.notFound)
    assertExposable(gaugePlugin, ErrorKeyEnum.notFound)
    assertExposable(capitalDistributorPlugin, ErrorKeyEnum.notFound)

    const campaignPrepare = await Models.CampaignPrepare.create({
      daoAddress,
      network,
      capitalDistributorAddress,
      gaugePluginAddress,
      epochId: params.epochId || '',
      tokenAddress,
      totalAmount,
      metadataUri,
      status: CampaignPrepareStatus.pending,
    })

    await RabbitMQHelper.sendMessage(EnumQueueName.prepareCampaignFromGauge, {
      id: campaignPrepare.id,
      params: { prepareId: campaignPrepare.id },
    })

    return {
      prepareId: campaignPrepare.id,
      status: CampaignPrepareStatus.pending,
    }
  },

  getPrepareStatus: async (prepareId: string): Promise<any> => {
    const campaignPrepare = await Models.CampaignPrepare.findByPrepareId(prepareId)
    assertExposable(campaignPrepare, ErrorKeyEnum.notFound)

    return {
      prepareId: campaignPrepare.id,
      status: campaignPrepare.status,
      progress: campaignPrepare.progress,
      daoAddress: campaignPrepare.daoAddress,
      network: campaignPrepare.network,
      capitalDistributorAddress: campaignPrepare.capitalDistributorAddress,
      gaugePluginAddress: campaignPrepare.gaugePluginAddress,
      epochId: campaignPrepare.epochId,
      tokenAddress: campaignPrepare.tokenAddress,
      totalAmount: campaignPrepare.totalAmount,
      totalMembers: campaignPrepare.totalMembers,
      merkleRoot: campaignPrepare.merkleRoot,
      metadataUri: campaignPrepare.metadataUri,
    }
  },
}

export default CapitalDistributorController
