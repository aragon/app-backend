import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IDaoExtraParams,
  type IDaoResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type NetworksEnum,
} from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const DaoController = {
  getDaosWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDaoExtraParams = {},
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)

    const result = await Models.Dao.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((dao: Dao) => dao.filterKeys())

    return result
  },

  getDaoById: async (id: string): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByEntityId(id)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaoByAddress: async (address: HexAddress, network: NetworksEnum): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByAddress(address, network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaosByMember: async (paginationParams: IPaginationParams = {}, extraParams: IDaoExtraParams = {}) => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams.memberAddress = await PairDataModule.checkIFEns(extraParams.memberAddress!)

    return await Models.Member.findDaoOfMemberWithPagination(extraParams, paginationParams)
  },
}

export default DaoController
