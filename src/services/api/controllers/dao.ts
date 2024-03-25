import { Models } from '@dbModels'
import {
  EnumPluginType,
  ErrorKeyEnum,
  type HexAddress,
  type IDaoMembersResponse,
  type IPlugin,
  type IResponseWithPagination,
  type IPaginationParams,
  type NetworksEnum,
} from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'
import Satsuma from '@helpers/satsuma'

const DaoController = {
  getWithPagination: async (
    params: IPaginationParams & { network: NetworksEnum; plugin: EnumPluginType },
  ): Promise<IResponseWithPagination> => {
    const { data, currentPage, totPages, totRecords } = await Models.Dao.findWithPagination(
      {
        networks: params.network ? [params.network] : [],
        pluginTypes: params.plugin ? [params.plugin] : [],
      },
      {
        search: params.search,
        toDate: params.toDate,
        fromDate: params.fromDate,
        limit: params.limit,
        skip: params.skip,
        order: params.order,
        orderProp: params.orderProp,
      },
    )

    return {
      currentPage,
      totPages,
      totRecords,
      data: data.map((dao: Dao) => dao.filterKeys()),
    }
  },

  getDao: async (network: NetworksEnum, address: HexAddress) => {
    const dao = await Models.Dao.findByDaoAddressAndNetwork(address, network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaoMembersMultiSig: async (
    network: NetworksEnum,
    address: HexAddress,
    memberFilters: IPaginationParams,
  ): Promise<IDaoMembersResponse> => {
    const dao = await Models.Dao.findByDaoAddressAndNetwork(address, network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const multiSigPlugin = dao.plugins.find((w: IPlugin) => w.type === EnumPluginType.MultisigPlugin)
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    const members = await Satsuma.getMultiSigMembers(network, multiSigPlugin.address, memberFilters)

    return {
      ...memberFilters,
      members,
    }
  },

  getDaoMembersTokenVoting: async (
    network: NetworksEnum,
    address: HexAddress,
    memberFilters: IPaginationParams,
  ): Promise<IDaoMembersResponse> => {
    const dao = await Models.Dao.findByDaoAddressAndNetwork(address, network)
    const multiSigPlugin = dao.plugins.find((w: IPlugin) => w.type === EnumPluginType.TokenVotingPlugin)

    assertExposable(dao, ErrorKeyEnum.notFound)
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    const members = await Satsuma.getTokenVotingMembers(network, multiSigPlugin.address, memberFilters)

    return {
      ...memberFilters,
      members,
    }
  },
}

export default DaoController
