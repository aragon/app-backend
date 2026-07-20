import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import { type CapitalDistributorGovernance, MemberGovernanceFactory } from '@src/governance'
import {
  EnumQueueName,
  ErrorKeyEnum,
  type HexAddress,
  type ICampaignApiParams,
  type ICampaignClaimer,
  type ICampaignPrepareStatus,
  type ICampaignResponse,
  type ICampaignUploadResult,
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

  getCampaignClaimers: async (
    paginationParams: IPaginationParams,
    params: {
      pluginAddress: HexAddress
      network: NetworksEnum
      campaignId: string
    },
  ): Promise<IPaginatedResult<ICampaignClaimer>> => {
    assertExposable(!!params.pluginAddress && !!params.network && !!params.campaignId, ErrorKeyEnum.badParams)

    const campaign = await Models.Campaign.findCampaignById(params.pluginAddress, params.network, params.campaignId)
    assertExposable(!!campaign, ErrorKeyEnum.notFound)

    return await Models.CampaignReward.getCampaignClaimers(
      params.pluginAddress,
      params.network,
      params.campaignId,
      paginationParams,
    )
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

  uploadCampaignMembers: async (params: {
    daoAddress: HexAddress
    capitalDistributorAddress: HexAddress
    network: NetworksEnum
    rewards: Array<{ address: string; amount: string }>
  }): Promise<ICampaignUploadResult> => {
    const { capitalDistributorAddress, network, rewards } = params

    const plugin = await Models.Plugin.findByAddress(capitalDistributorAddress, network)
    assertExposable(plugin && plugin.interfaceType === IPluginInterfaceType.capitalDistributor, ErrorKeyEnum.notFound)

    const campaignId = Utils.generateRandomName(20)

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    const uploadResult = await governance.uploadMembersList({
      campaignId,
      pluginAddress: capitalDistributorAddress,
      network,
      rewards,
    })

    await RabbitMQHelper.sendMessage(EnumQueueName.syncMerkleProofs, {
      id: `${capitalDistributorAddress}-${network}-${campaignId}`,
      params: {
        campaignId,
        pluginAddress: capitalDistributorAddress,
        network,
        isDraft: true,
      },
    })

    return {
      ...uploadResult,
      campaignId,
    }
  },

  getCampaignPrepareStatus: async (params: {
    capitalDistributorAddress: HexAddress
    network: NetworksEnum
    campaignId: string
  }): Promise<ICampaignPrepareStatus | null> => {
    const { capitalDistributorAddress, network, campaignId } = params

    const plugin = await Models.Plugin.findByAddress(capitalDistributorAddress, network)
    assertExposable(plugin && plugin.interfaceType === IPluginInterfaceType.capitalDistributor, ErrorKeyEnum.notFound)

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    return await governance.getMerkleGenerationStatus({ campaignId, pluginAddress: capitalDistributorAddress, network })
  },
}

export default CapitalDistributorController
