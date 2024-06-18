import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import { assertExposable } from '@errors'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    return await Models.Member.findWithPagination({ extraParams, paginationParams })
  },

  // TODO: change
  getMemberById: async (id: string): Promise<IMembersResponse> => {
    const member = await Models.Member.findByEntityId(id)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member.filterKeys()
  },
}

export default MemberController
