import { Models } from '@dbModels'
import { type IPaginatedResult, type IPaginationParams, type IVoteExtraParams, type IVoteResponse } from '@types'
import type Vote from '@models/schema/vote'

const VoteController = {
  getVoteWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IVoteExtraParams = {},
  ): Promise<IPaginatedResult<IVoteResponse>> => {
    const result = await Models.Vote.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((vote: Vote) => vote.filterKeys())
    return result
  },
}

export default VoteController
