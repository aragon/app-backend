import { Models } from '@dbModels'
import {
  type IDelegateExtraParams,
  type IDelegatesResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import PairDataModule from '@modules/pairData'
import type DaoMemberMapping from '@models/schema/daoMemberMapping'

const DelegateController = {
  getDelegateWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDelegateExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IDelegatesResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const mapping = await PairDataModule.pairFromDaoMemberMapping({
      daoAddress: extraParams.daoAddress,
      pluginAddress: extraParams.pluginAddress,
      network: extraParams.network,
    })

    const memberAddresses = mapping.map((w: DaoMemberMapping) => w.memberAddress)

    const result = await Models.MemberTransaction.findWithPagination({
      extraParams,
      paginationParams,
      extraQueryData: { memberAddresses },
    })

    return result
  },
}

export default DelegateController
