import { Models } from '@dbModels'
import {
  type ENS,
  type IPaginatedResult,
  type IPaginationParams,
  type IVoteExtraParams,
  type IVoteResponse,
} from '@types'
import type Vote from '@models/schema/vote'
import ModelUtils from '@models/utils/models'

const VoteController = {
  getVoteWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IVoteExtraParams = {},
    ens?: ENS,
  ): Promise<IPaginatedResult<IVoteResponse>> => {
    if (ens) {
      const member = await Models.Member.findByEns(ens)
      if (!member) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.memberAddress = member.address
    }
    const result = await Models.Vote.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((vote: Vote) => vote.filterKeys())
    return result
  },
}

export default VoteController
