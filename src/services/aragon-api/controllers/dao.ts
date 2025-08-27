import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IDaoExtraParams,
  type IDaoResponse,
  type IPaginatedResult,
  type IPaginationParams,
  IPluginInterfaceType,
  IPluginStatus,
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
    const dao = await Models.Dao.findOne({ ens, network, isHidden: { $ne: true }, isActive: { $eq: true } })
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetails(dao.address, dao.network)
  },

  getDaosByMember: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDaoExtraParams = {},
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams.memberAddress = await PairDataModule.checkIFEns(extraParams.memberAddress!)
    extraParams.excludedDao = extraParams.excludeDaoId
      ? ((await PairDataModule.pairFromExtraParams({}, { daoId: extraParams.excludeDaoId })) as {
          daoAddress: string
          network: NetworksEnum
        })
      : undefined

    const networkFilter = extraParams.networks?.length ? { network: { $in: extraParams.networks } } : {}
    const allDaoAddresses = await DaoController.getDaosOfMemberInNetwork(extraParams.memberAddress, networkFilter)

    const extraQueryData = { daoAddresses: allDaoAddresses }

    return await Models.Dao.findWithPagination({ extraParams, paginationParams, extraQueryData })
  },

  getDaosOfMemberInNetwork: async (memberAddress: any, networkFilter: any = {}) => {
    const [tokenMembers, veMembers, lockMembers, pluginMembers] = await Promise.all([
      Models.TokenMember.distinct('tokenAddress', { memberAddress, ...networkFilter }),
      Models.Lock.distinct('tokenAddress', { delegateReceiverAddress: memberAddress, ...networkFilter }),
      Models.LockToVoteMember.distinct('lockManagerAddress', { memberAddress, ...networkFilter }),
      Models.PluginMember.distinct('pluginAddress', { memberAddress, ...networkFilter }),
    ])

    return await Models.Plugin.distinct('daoAddress', {
      $or: [
        { tokenAddress: { $in: tokenMembers }, interfaceType: IPluginInterfaceType.tokenVoting },
        { tokenAddress: { $in: veMembers }, interfaceType: IPluginInterfaceType.tokenVoting },
        { lockManagerAddress: { $in: lockMembers }, interfaceType: IPluginInterfaceType.lockToVote },
        {
          address: { $in: pluginMembers },
          interfaceType: { $in: [IPluginInterfaceType.multisig, IPluginInterfaceType.admin] },
        },
      ],
      status: IPluginStatus.installed,
      isSupported: true,
      ...networkFilter,
    })
  },
}

export default DaoController
