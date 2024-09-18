import { Models } from '@dbModels'
import {
  type IDelegateExtraParams,
  type IDelegatesResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import PairDataModule from '@modules/pairData'

const DelegateController = {
  getDelegateWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDelegateExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IDelegatesResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const result = await Models.MemberTransaction.findWithPagination({ extraParams, paginationParams })

    return result
  },
}

export default DelegateController
