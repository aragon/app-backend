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
} from '@types'
import { assertExposable } from '@errors'

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
}

export default CapitalDistributorController
