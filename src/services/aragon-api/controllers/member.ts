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

    const result = await Models.Member.findWithPagination({ extraParams, paginationParams })
    return result
  },

  getMemberByAddress: async (address: string, extraParams: IMemberExtraParams = {}): Promise<IMembersResponse> => {
    const member = await Models.Member.findMemberByAddress(address, extraParams)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member
  },
}

export default MemberController
