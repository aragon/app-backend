import { Models } from '@dbModels'
import {
  type IDelegateExtraParams,
  type IDelegatesResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import type Delegate from '@models/schema/delegate'
import ModelUtils from '@models/utils/models'

const DelegateController = {
  getDelegateWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDelegateExtraParams = {},
    daoId?: string,
  ): Promise<IPaginatedResult<IDelegatesResponse>> => {
    if (daoId) {
      const daoDb = await Models.Dao.findByEntityId(daoId)
      if (!daoDb) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.daoAddress = daoDb.address
      extraParams.network = daoDb.network
    }
    const result = await Models.Delegate.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((delegate: Delegate) => delegate.filterKeys())
    return result
  },
}

export default DelegateController
