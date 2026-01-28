import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
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
  type IPrepareCampaignFromGauge,
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

  prepareCampaignFromGauge: async (params: {
    daoAddress: HexAddress
    network: NetworksEnum
    gaugePluginAddress: HexAddress
    tokenAddress: HexAddress
    totalAmount: string
    capitalDistributorAddress?: HexAddress
    epochId?: string
    metadata?: {
      title?: string
      description?: string
      resources?: Array<{ name: string; url: string }>
    }
  }): Promise<{ prepareId: string; status: CampaignPrepareStatus }> => {
    const { daoAddress, network, gaugePluginAddress, tokenAddress, totalAmount, metadata } = params

    const dao = await Models.Dao.findByAddress(daoAddress, network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const gaugePlugin = await Models.Plugin.findByAddress(gaugePluginAddress, network)
    assertExposable(gaugePlugin, ErrorKeyEnum.notFound)
    assertExposable(gaugePlugin.daoAddress === daoAddress, ErrorKeyEnum.badParams)
    assertExposable(gaugePlugin.interfaceType === IPluginInterfaceType.gauge, ErrorKeyEnum.badParams)

    let capitalDistributorAddress = params.capitalDistributorAddress
    if (!capitalDistributorAddress) {
      const capitalDistributorPlugin = await Models.Plugin.findOne({
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.capitalDistributor,
      })
      assertExposable(capitalDistributorPlugin, ErrorKeyEnum.notFound)
      capitalDistributorAddress = capitalDistributorPlugin.address
    } else {
      const capitalDistributorPlugin = await Models.Plugin.findByAddress(capitalDistributorAddress, network)
      assertExposable(capitalDistributorPlugin, ErrorKeyEnum.notFound)
      assertExposable(capitalDistributorPlugin.daoAddress === daoAddress, ErrorKeyEnum.badParams)
      assertExposable(
        capitalDistributorPlugin.interfaceType === IPluginInterfaceType.capitalDistributor,
        ErrorKeyEnum.badParams,
      )
    }

    assertExposable(BigInt(totalAmount) > 0n, ErrorKeyEnum.badParams)

    const campaignPrepare = await Models.CampaignPrepare.create({
      daoAddress,
      network,
      capitalDistributorAddress,
      gaugePluginAddress,
      epochId: params.epochId || '',
      tokenAddress,
      totalAmount,
      status: CampaignPrepareStatus.pending,
      metadata,
    })

    const queueParams: IPrepareCampaignFromGauge = {
      prepareId: campaignPrepare.id,
      daoAddress,
      network,
      capitalDistributorAddress: capitalDistributorAddress!,
      gaugePluginAddress,
      epochId: params.epochId || '',
      tokenAddress,
      totalAmount,
      metadata,
    }

    await RabbitMQHelper.sendMessage(EnumQueueName.prepareCampaignFromGauge, {
      id: campaignPrepare.id,
      params: queueParams,
    })

    return {
      prepareId: campaignPrepare.id,
      status: CampaignPrepareStatus.pending,
    }
  },

  getPrepareStatus: async (prepareId: string): Promise<any> => {
    const campaignPrepare = await Models.CampaignPrepare.findByPrepareId(prepareId)
    assertExposable(campaignPrepare, ErrorKeyEnum.notFound)

    const result: any = {
      prepareId: campaignPrepare.id,
      status: campaignPrepare.status,
      daoAddress: campaignPrepare.daoAddress,
      network: campaignPrepare.network,
      capitalDistributorAddress: campaignPrepare.capitalDistributorAddress,
      gaugePluginAddress: campaignPrepare.gaugePluginAddress,
      epochId: campaignPrepare.epochId,
      tokenAddress: campaignPrepare.tokenAddress,
      totalAmount: campaignPrepare.totalAmount,
      totalMembers: campaignPrepare.totalMembers,
      campaignId: campaignPrepare.campaignId,
      metadata: campaignPrepare.metadata,
    }

    if (campaignPrepare.status === CampaignPrepareStatus.completed && campaignPrepare.campaignId) {
      const merkleRoot = await Models.CampaignMerkleRoot.findByParams(
        campaignPrepare.capitalDistributorAddress,
        campaignPrepare.network,
        campaignPrepare.campaignId,
      )
      if (merkleRoot) {
        result.merkleRoot = merkleRoot.merkleRoot
      }
    }

    return result
  },
}

export default CapitalDistributorController
