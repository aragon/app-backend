import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type ICampaignExtraParams,
  type ICampaignResponse,
  type IPaginationParams,
  type IPaginatedResult,
} from '@types'
import { assertExposable } from '@errors'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'controllers:CapitalDistributor' })

const CapitalDistributorController = {
  getCampaignsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ICampaignExtraParams = {},
  ): Promise<IPaginatedResult<ICampaignResponse>> => {
    try {
      assertExposable(!!extraParams.pluginAddress, ErrorKeyEnum.badParams)
      assertExposable(!!extraParams.network, ErrorKeyEnum.badParams)

      return await Models.Campaign.getCampaignsWithPagination({
        paginationParams,
        extraParams,
      })
    } catch (error) {
      logger.error('Error retrieving campaigns with pagination', llo({ error, extraParams }))
      throw error
    }
  },
}

export default CapitalDistributorController
