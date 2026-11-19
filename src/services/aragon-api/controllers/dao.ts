import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import PairDataModule from '@modules/pairData'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { MemberGovernanceFactory } from '@src/governance'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IDaoExtraParams,
  type IDaoNetworkPair,
  type IDaoResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type MembershipData,
  type NetworkGroupedAddresses,
  type NetworksEnum,
} from '@types'

const DaoController = {
  getDaosWithPagination: async (
    paginationParams: IPaginationParams,
    extraParams: IDaoExtraParams,
  ): Promise<IPaginatedResult<IDaoResponse>> => {
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
    extraParams.excludedDao = extraParams.excludeDaoId
      ? ((await PairDataModule.pairFromExtraParams({}, { daoId: extraParams.excludeDaoId })) as {
          daoAddress: HexAddress
          network: NetworksEnum
        })
      : undefined

    const networkFilter = extraParams.networks?.length ? { network: { $in: extraParams.networks } } : {}
    const allDaoPairs = await DaoController.getDaosOfMemberInNetwork(extraParams.memberAddress!, networkFilter)

    const extraQueryData = { daoPairs: allDaoPairs }

    return await Models.Dao.findWithPagination({ extraParams, paginationParams, extraQueryData })
  },

  getDaosOfMemberInNetwork: async (
    memberAddress: string,
    networkFilter: Record<string, unknown> = {},
  ): Promise<IDaoNetworkPair[]> => {
    const [memberPlugins, safeMembersQuery] = await Promise.all([
      MemberGovernanceFactory.findPluginsOfMember(memberAddress, networkFilter),
      Models.SafeMember.aggregate([
        { $match: { memberAddress, ...networkFilter } },
        { $project: { _id: 0, safeAddress: 1, network: 1 } },
      ]),
    ])

    const daoPairs = new Map<string, IDaoNetworkPair>()
    const safeAddressesByNetwork = DaoController.groupByNetwork(safeMembersQuery as MembershipData[], 'safeAddress')

    await Promise.all(
      Object.entries(safeAddressesByNetwork).map(async ([network, safeAddresses]) => {
        const daos = await SafeBodyMembersModule.findDaosWithSafeBody(
          [...new Set(safeAddresses)] as HexAddress[],
          network as NetworksEnum,
        )
        for (const dao of daos) daoPairs.set(`${dao.network}-${dao.daoAddress}`, dao)
      }),
    )

    for (const { daoAddress, network } of memberPlugins) {
      if (daoAddress && network) daoPairs.set(`${network}-${daoAddress}`, { daoAddress, network })
    }

    return [...daoPairs.values()]
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
    const extraQueryData = await PairDataModule.pairExtraQueryData(extraParams)
    return await Models.Dao.findWithPaginationWithoutPlugins({ extraParams, paginationParams, extraQueryData })
  },

  getDaoByIdWithoutPlugins: async (id: string, onlyParent?: boolean): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByEntityId(id)
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetailsWithoutPlugins(dao.address, dao.network, onlyParent)
  },

  getDaoByAddressWithoutPlugins: async (
    address: HexAddress,
    network: NetworksEnum,
    onlyParent?: boolean,
  ): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByAddress(address, network)
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetailsWithoutPlugins(dao.address, dao.network, onlyParent)
  },

  getDaoByEnsWithoutPlugins: async (
    ens: string,
    network: NetworksEnum,
    onlyParent?: boolean,
  ): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findOne({ ens, network, isHidden: { $ne: true }, isActive: { $eq: true } })
    assertExposable(dao, ErrorKeyEnum.notFound)
    return await Models.Dao.getDaoDetailsWithoutPlugins(dao.address, dao.network, onlyParent)
  },

  getDaosByMemberWithoutPlugins: async (
    paginationParams: IPaginationParams,
    extraParams: IDaoExtraParams,
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    extraParams.excludedDao = extraParams.excludeDaoId
      ? ((await PairDataModule.pairFromExtraParams({}, { daoId: extraParams.excludeDaoId })) as {
          daoAddress: string
          network: NetworksEnum
        })
      : undefined

    const networkFilter = extraParams.networks?.length ? { network: { $in: extraParams.networks } } : {}
    const allDaoPairs = await DaoController.getDaosOfMemberInNetwork(extraParams.memberAddress!, networkFilter)

    const extraQueryData = { daoPairs: allDaoPairs }

    return await Models.Dao.findWithPaginationWithoutPlugins({ extraParams, paginationParams, extraQueryData })
  },
}

export default DaoController
