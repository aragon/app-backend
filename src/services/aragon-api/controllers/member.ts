import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import type DaoMemberMapping from '@models/schema/daoMemberMapping'

const MemberController = {
  getMembersWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IMembersResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    const mapping = await PairDataModule.pairFromDaoMemberMapping({
      daoAddress: extraParams.daoAddress,
      pluginAddress: extraParams.pluginAddress,
      network: extraParams.network,
    })

    const memberAddresses = mapping.map((w: DaoMemberMapping) => w.memberAddress)

    const result = await Models.Member.findWithPagination({
      extraParams,
      paginationParams,
      extraQueryData: { memberAddresses },
    })

    return result
  },

  getMemberByAddress: async (
    address: string,
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IMembersResponse> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const member = await Models.Member.findMemberByAddress(address, extraParams)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member
  },
}

export default MemberController
