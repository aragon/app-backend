import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import { assertExposable } from '@errors'
import ModelUtils from '@models/utils/models'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    daoId?: string,
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    if (daoId) {
      const daoDb = await Models.Dao.findByEntityId(daoId)
      if (!daoDb) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.daoAddress = daoDb.address
      extraParams.network = daoDb.network
    }

    return await Models.Member.findWithPagination({ extraParams, paginationParams })
  },

  getMemberById: async (id: string): Promise<IMembersResponse> => {
    const member = await Models.Member.findByEntityId(id)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member.filterMemberKeys()
  },
}

export default MemberController
