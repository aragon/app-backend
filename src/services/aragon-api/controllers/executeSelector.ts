import { Models } from '@dbModels'
import {
  type IExecuteSelectorExtraParams,
  type IExecuteSelectorResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'

const ExecuteSelectorController = {
  async getExecuteSelectorsWithPagination(
    paginationParams: IPaginationParams,
    extraParams: IExecuteSelectorExtraParams,
  ): Promise<IPaginatedResult<IExecuteSelectorResponse>> {
    return await Models.SelectorPermission.findWithPagination({
      paginationParams,
      extraParams,
    })
  },
}

export default ExecuteSelectorController
