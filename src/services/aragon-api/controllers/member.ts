import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IActiveMemberExtraParams,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import { assertExposable } from '@errors'
import ModelUtils from '@models/utils/models'
import type Member from '@models/schema/member'

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
    result.data = result.data.map((m: Member) => m.filterKeys())
    return result
  },

  getActiveMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IActiveMemberExtraParams = {},
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

    const result = await Models.Member.findActiveWithPagination({ extraParams, paginationParams })
    return result
  },

  getMemberById: async (address: string): Promise<IMembersResponse> => {
    const member = await Models.Member.findByEntityId(address)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member.filterKeys()
  },

  getActiveMemberByAddress: async (
    address: string,
    extraParams: IActiveMemberExtraParams = {},
  ): Promise<IMembersResponse> => {
    const member = await Models.Member.findActiveMember(address, extraParams)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member
  },
}

export default MemberController
