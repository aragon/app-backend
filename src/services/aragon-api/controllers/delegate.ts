import { Models } from '@dbModels'
import {
  type IDelegateExtraParams,
  type IDelegatesResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import type Delegate from '@models/schema/delegate'

const DelegateController = {
  getDelegateWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDelegateExtraParams = {},
  ): Promise<IPaginatedResult<IDelegatesResponse>> => {
    const result = await Models.Delegate.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((delegate: Delegate) => delegate.filterKeys())
    return result
  },
}

export default DelegateController
