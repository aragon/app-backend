import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type HexAddress,
  IMembersResponse,
  IPaginatedResult,
  type IPaginationParams,
  IPluginSubdomain,
  type NetworksEnum,
} from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'

const DaoController = {
  getWithPagination: async (
    params: IPaginationParams & { network: NetworksEnum; pluginAddress: HexAddress },
  ): Promise<IPaginatedResult<Dao>> => {
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
      metadata: {
        ...params,
        currentPage,
        totPages,
        totRecords,
      },
      data: data.map((dao: Dao) => dao.filterKeys()),
    }
  },

  getDaoByPermalink: async (permalink: string): Promise<Dao> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },

  getDaoMembers: async ({
    permalink,
    pluginAddress,
    subdomain,
    filterParams,
  }): Promise<IPaginatedResult<IMembersResponse>> => {
    const dao = await Models.Dao.findByPermalink(permalink)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const multiSigPlugin = dao.plugins.find(
      (w: { subdomain: IPluginSubdomain; address: string }) => w.subdomain === subdomain && w.address === pluginAddress,
    )
    assertExposable(multiSigPlugin, ErrorKeyEnum.pluginNotFound)

    return await Models.Member.findMembersByPlugin(pluginAddress, filterParams)
  },
}

export default DaoController
