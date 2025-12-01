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
  type MembershipData,
  type NetworkGroupedAddresses,
} from '@types'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'

const DaoController = {
  getDaosWithPagination: async (
    paginationParams: IPaginationParams,
    extraParams: IDaoExtraParams,
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
    paginationParams: IPaginationParams,
    extraParams: IDaoExtraParams,
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

  getDaosOfMemberInNetwork: async (memberAddress: string, networkFilter: any = {}): Promise<string[]> => {
    const [tokenMembersQuery, veMembersQuery, lockMembersQuery, pluginMembersQuery] = await Promise.all([
      Models.TokenMember.aggregate([
        { $match: { memberAddress, ...networkFilter } },
        { $project: { _id: 0, tokenAddress: 1, network: 1 } },
      ]),
      Models.Lock.aggregate([
        { $match: { delegateReceiverAddress: memberAddress, ...networkFilter } },
        { $project: { _id: 0, tokenAddress: 1, network: 1 } },
      ]),
      Models.LockToVoteMember.aggregate([
        { $match: { memberAddress, ...networkFilter } },
        { $project: { _id: 0, lockManagerAddress: 1, network: 1 } },
      ]),
      Models.PluginMember.aggregate([
        { $match: { memberAddress, ...networkFilter } },
        { $project: { _id: 0, pluginAddress: 1, network: 1 } },
      ]),
    ])

    if (
      tokenMembersQuery.length === 0 &&
      veMembersQuery.length === 0 &&
      lockMembersQuery.length === 0 &&
      pluginMembersQuery.length === 0
    ) {
      return []
    }

    const orQueries: any[] = []

    const tokenMembersByNetwork = DaoController.groupByNetwork(tokenMembersQuery as MembershipData[], 'tokenAddress')
    const veMembersByNetwork = DaoController.groupByNetwork(veMembersQuery as MembershipData[], 'tokenAddress')

    const lockMembersByNetwork = DaoController.groupByNetwork(
      lockMembersQuery as MembershipData[],
      'lockManagerAddress',
    )

    const pluginMembersByNetwork = DaoController.groupByNetwork(pluginMembersQuery as MembershipData[], 'pluginAddress')

    Object.keys(tokenMembersByNetwork).forEach(network => {
      if (tokenMembersByNetwork[network].length > 0) {
        orQueries.push({
          tokenAddress: { $in: tokenMembersByNetwork[network] },
          interfaceType: IPluginInterfaceType.tokenVoting,
          network,
        })
      }
    })

    Object.keys(veMembersByNetwork).forEach(network => {
      if (veMembersByNetwork[network].length > 0) {
        orQueries.push({
          tokenAddress: { $in: veMembersByNetwork[network] },
          interfaceType: IPluginInterfaceType.tokenVoting,
          network,
        })
      }
    })

    Object.keys(lockMembersByNetwork).forEach(network => {
      if (lockMembersByNetwork[network].length > 0) {
        orQueries.push({
          lockManagerAddress: { $in: lockMembersByNetwork[network] },
          interfaceType: IPluginInterfaceType.lockToVote,
          network,
        })
      }
    })

    Object.keys(pluginMembersByNetwork).forEach(network => {
      if (pluginMembersByNetwork[network].length > 0) {
        orQueries.push({
          address: { $in: pluginMembersByNetwork[network] },
          interfaceType: { $in: [IPluginInterfaceType.multisig, IPluginInterfaceType.admin] },
          network,
        })
      }
    })

    if (orQueries.length === 0) {
      return []
    }

    return await Models.Plugin.distinct('daoAddress', {
      $or: orQueries,
      status: IPluginStatus.installed,
      isSupported: true,
      ...networkFilter,
    })
  },

  groupByNetwork: (data: MembershipData[], addressField: keyof MembershipData): NetworkGroupedAddresses => {
    return data.reduce<NetworkGroupedAddresses>((acc, item) => {
      const network = item.network
      const address = item[addressField]!

      if (address) {
        if (!acc[network]) {
          acc[network] = []
        }
        acc[network].push(address)
      }
      return acc
    }, {})
  },

  // API methods - without plugins (uses separate plugins endpoint)
  getDaosWithPaginationWithoutPlugins: async (
    paginationParams: IPaginationParams,
    extraParams: IDaoExtraParams,
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    const extraQueryData = await PairDataModule.pairExtraQueryData(extraParams)
    return await Models.Dao.findWithPaginationWithoutPlugins({ extraParams, paginationParams, extraQueryData })
  },

  getDaoByIdWithoutPlugins: async (id: string): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByEntityId(id)
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetailsWithoutPlugins(dao.address, dao.network)
  },

  getDaoByAddressWithoutPlugins: async (address: HexAddress, network: NetworksEnum): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByAddress(address, network)
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetailsWithoutPlugins(dao.address, dao.network)
  },

  getDaoByEnsWithoutPlugins: async (ens: string, network: NetworksEnum): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findOne({ ens, network, isHidden: { $ne: true }, isActive: { $eq: true } })
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetailsWithoutPlugins(dao.address, dao.network)
  },

  getDaosByMemberWithoutPlugins: async (
    paginationParams: IPaginationParams,
    extraParams: IDaoExtraParams,
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

    return await Models.Dao.findWithPaginationWithoutPlugins({ extraParams, paginationParams, extraQueryData })
  },
}

export default DaoController
