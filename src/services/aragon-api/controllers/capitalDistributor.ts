import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type ICampaignExtraParams,
  type ICampaignResponse,
  type IPaginationParams,
  type IPaginatedResult,
} from '@types'
import { assertExposable } from '@errors'

const CapitalDistributorController = {
  getCampaignsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ICampaignExtraParams = {},
  ): Promise<IPaginatedResult<ICampaignResponse>> => {
    assertExposable(!!extraParams.pluginAddress, ErrorKeyEnum.badParams)
    assertExposable(!!extraParams.network, ErrorKeyEnum.badParams)

    return await Models.Campaign.getCampaignsWithPagination({
      paginationParams,
      extraParams,
    })
  },
}

export default CapitalDistributorController
