import { Models } from '@dbModels'
import { type IAssetResponse, type ICampaignApiParams, type IPaginatedResult, type IPaginationParams } from '@types'

const GaugeController = {
  getGaugesWithPagination: async (
    paginationParams: IPaginationParams = {},
    params: ICampaignApiParams = {},
  ): Promise<IPaginatedResult<IAssetResponse>> => {
    return await Models.Gauge.findWithPagination({ params, paginationParams })
  },
}

export default GaugeController
