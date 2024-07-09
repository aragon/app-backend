import { Models } from '@dbModels'
import {
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type IVoteExtraParams,
  type IVoteResponse,
} from '@types'
import type Vote from '@models/schema/vote'
import PairDataModule from '@modules/pairData'

const VoteController = {
  getVoteWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IVoteExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IVoteResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const result = await Models.Vote.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((vote: Vote) => vote.filterKeys())

    return result
  },
}

export default VoteController
