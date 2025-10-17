import { Models } from '@dbModels'
import { type IGaugeResponse, type ICampaignApiParams, type IPaginatedResult, type IPaginationParams } from '@types'

const GaugeController = {
  getGaugesWithPagination: async (
    paginationParams: IPaginationParams = {},
    params: ICampaignApiParams = {},
  ): Promise<IPaginatedResult<IGaugeResponse>> => {
    return await Models.Gauge.findWithPagination({ params, paginationParams })
  },
}

export default GaugeController
