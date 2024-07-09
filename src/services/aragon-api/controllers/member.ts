import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IActiveMemberExtraParams,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const result = await Models.Member.findWithPagination({ extraParams, paginationParams })

    return result
  },

  getMemberByAddress: async (address: string, extraParams: IMemberExtraParams = {}): Promise<IMembersResponse> => {
    const member = await Models.Member.findMemberByAddress(address, extraParams)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member
  },

  getActiveMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IActiveMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const result = await Models.Member.findActiveWithPagination({ extraParams, paginationParams })

    return result
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
