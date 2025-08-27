import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type ICampaignResponse,
  type IPaginationParams,
  type IPaginatedResult,
  type ICampaignApiParams,
  type IUserCampaignStatus,
  type HexAddress,
  type NetworksEnum,
  IPluginInterfaceType,
} from '@types'
import { assertExposable } from '@errors'
import { MemberGovernanceFactory, type CapitalDistributorGovernance } from '@src/governance'

const CapitalDistributorController = {
  getCampaignsWithPagination: async (
    paginationParams: IPaginationParams = {},
    params: ICampaignApiParams = {},
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
}

export default CapitalDistributorController
