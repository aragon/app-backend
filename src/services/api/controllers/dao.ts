import { Models } from '@dbModels'
import {
  type EnumPluginType,
  type IResponseWithPagination,
  type ItxOpts,
  type NetworksEnum,
} from '@types'
import type Dao from '@models/schema/dao'

const DaoController = {
  getWithPagination: async(
    params: ItxOpts & { network: NetworksEnum, plugin: EnumPluginType },
  ): Promise<IResponseWithPagination> => {
    const { data, currentPage, totPages, totRecords } =
      await Models.Dao.findWithPagination(
        {
          networks: params.network ? [params.network] : [],
          pluginNames: params.plugin ? [params.plugin] : [],
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
}

export default DaoController
