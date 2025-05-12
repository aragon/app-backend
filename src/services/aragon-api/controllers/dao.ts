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
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const DaoController = {
  getDaosWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDaoExtraParams = {},
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    const extraQueryData = await PairDataModule.pairExtraQueryData(extraParams)
    return await Models.Dao.findWithPagination({ extraParams, paginationParams, extraQueryData })
  },

  getDaoById: async (id: string): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByEntityId(id)
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetails(dao.address, dao.network)
  },

  getDaoByAddress: async (address: HexAddress, network: NetworksEnum): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByAddress(address, network)
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetails(dao.address, dao.network)
  },

  getDaoByEns: async (ens: string, network: NetworksEnum): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findOne({ subdomain: ens, network, isHidden: { $ne: true }, isActive: { $eq: true } })
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetails(dao.address, dao.network)
  },

  getDaosByMember: async (paginationParams: IPaginationParams = {}, extraParams: IDaoExtraParams = {}) => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams.memberAddress = await PairDataModule.checkIFEns(extraParams.memberAddress!)
    extraParams.excludedDao = extraParams.excludeDaoId
      ? ((await PairDataModule.pairFromExtraParams({}, { daoId: extraParams.excludeDaoId })) as {
          daoAddress: string
          network: NetworksEnum
        })
      : undefined

    const mapping = await PairDataModule.pairFromDaoMemberMapping({
      memberAddress: extraParams.memberAddress,
    })
    const daoAddresses = mapping
      .map(m => m.daoAddress)
      .filter((daoAddress: HexAddress) => daoAddress !== extraParams?.excludedDao?.daoAddress)

    return await Models.Dao.findWithPagination({
      extraParams,
      paginationParams,
      extraQueryData: { daoAddresses },
    })
  },
}

export default DaoController
