import { Models } from '@dbModels'
import {
  EnumPluginType,
  type HexAddress,
  type IPlugin,
  type IResponseWithPagination,
  type ItxOpts,
  type NetworksEnum,
} from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'
import Satsuma from '@helpers/satsuma'

const DaoController = {
  getWithPagination: async(
    params: ItxOpts & { network: NetworksEnum, plugin: EnumPluginType },
  ): Promise<IResponseWithPagination> => {
    const { data, currentPage, totPages, totRecords } =
      await Models.Dao.findWithPagination(
        {
          networks: params.network ? [params.network] : [],
          pluginTypes: params.plugin ? [params.plugin] : [],
        },
        {
          search: params.search,
          toDate: params.toDate,
          fromDate: params.fromDate,
          limit: params.limit,
          offset: params.offset,
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

  getDao: async(network: NetworksEnum, address: HexAddress) => {
    const dao = await Models.Dao.findByDaoAddressAndNetwork(address, network)
    assertExposable(dao, 'not_found')

    return dao.filterKeys()
  },

  getDaoMembers: async(network: NetworksEnum, address: HexAddress) => {
    const dao = await Models.Dao.findByDaoAddressAndNetwork(address, network)
    assertExposable(dao, 'not_found')

    const daoMembers = await Promise.all(
      dao.plugins.map(async(plugin: IPlugin) => {
        const result = {
          tokenVotingMembers: [],
          multisigApprovers: [],
        }

        if (plugin.type === EnumPluginType.MultisigPlugin) {
          result.multisigApprovers = await Satsuma.getMultiSigMembers(
            network,
            plugin.address,
            {
              limit: 10,
              skip: 0,
              orderBy: 'address',
              orderDirection: 'asc',
            },
          )
        }

        if (plugin.type === EnumPluginType.TokenVotingPlugin) {
          result.tokenVotingMembers = await Satsuma.getTokenVotingMembers(
            network,
            plugin.address,
            {
              limit: 10,
              skip: 0,
              orderBy: 'address',
              orderDirection: 'asc',
            },
          )
        }

        return result
      }),
    )

    return daoMembers
  },
}

export default DaoController
