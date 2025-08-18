import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type ICampaignResponse,
  type IPaginationParams,
  type IPaginatedResult,
  type ICampaignApiParams,
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
}

export default CapitalDistributorController
