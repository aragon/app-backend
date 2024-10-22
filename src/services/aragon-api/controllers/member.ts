import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IMemberExtraParams,
  type IMembersResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import type DaoMemberMapping from '@models/schema/daoMemberMapping'
import ModelUtils from '@models/utils/models'

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

    if (Object.values(extraParams).filter(v => v).length > 0 && memberAddresses.length === 0) {
      return ModelUtils.paginateEmptyResponse(paginationParams.limit!)
    }

    const result = await Models.Member.findWithPagination({
      extraParams,
      paginationParams,
      extraQueryData: { memberAddresses },
    })

    return result
  },

  getMemberByAddress: async (
    address: HexAddress,
    extraParams: IMemberExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IMembersResponse> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const member = await Models.Member.findMemberByAddress(address, extraParams)
    assertExposable(member, ErrorKeyEnum.notFound)

    return member
  },

  isMemberOfPlugin: async (memberAddress: HexAddress, pluginAddress: HexAddress): Promise<boolean> => {
    const member = await Models.DaoMemberMapping.findOne({
      memberAddress,
      pluginAddress,
    })

    return !!member
  },
}

export default MemberController
