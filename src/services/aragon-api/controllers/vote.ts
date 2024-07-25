import { Models } from '@dbModels'
import {
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type IVoteExtraParams,
  type IVoteResponse,
} from '@types'
import PairDataModule from '@modules/pairData'

const VoteController = {
  getVoteWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IVoteExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IVoteResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    return await Models.Vote.findWithPagination({ extraParams, paginationParams })
  },
}

export default VoteController
