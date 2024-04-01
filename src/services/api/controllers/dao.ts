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
    params: IPaginationParams & { network: NetworksEnum; pluginAddress: HexAddress },
  ): Promise<IResponseWithPagination> => {
    const { data, currentPage, totPages, totRecords } = await Models.Dao.findWithPagination(
      {
        networks: params.network ? [params.network] : [],
        pluginAddress: params.pluginAddress,
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
      ...params,
      currentPage,
      totPages,
      totRecords,
      data: data.map((dao: Dao) => dao.filterKeys()),
    }
  },

  getDaoByPermalink: async (permalink: string) => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaoMembersMultiSig: async (
    permalink: string,
    pluginAddress: HexAddress,
    memberFilters: IPaginationParams,
  ): Promise<IDaoMembersResponse> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const multiSigPlugin = dao.plugins.find(
      (w: IPlugin) => w.type === EnumPluginType.MultisigPlugin && w.address === pluginAddress,
    )
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    const members = await Satsuma.getMultiSigMembers(dao.network, multiSigPlugin.address, memberFilters)

    return {
      ...memberFilters,
      members,
    }
  },

  getDaoMembersTokenVoting: async (
    permalink: string,
    pluginAddress: HexAddress,
    memberFilters: IPaginationParams,
  ): Promise<IDaoMembersResponse> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const multiSigPlugin = dao.plugins.find(
      (w: IPlugin) => w.type === EnumPluginType.TokenVotingPlugin && w.address === pluginAddress,
    )
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    const members = await Satsuma.getTokenVotingMembers(dao.network, multiSigPlugin.address, memberFilters)

    return {
      ...memberFilters,
      members,
    }
  },
}

export default DaoController
