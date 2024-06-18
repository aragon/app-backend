import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  type IDaoExtraParams,
  type IDaoResponse,
  type IPaginatedResult,
  type IPaginationParams,
} from '@types'
import type Dao from '@models/schema/dao'
import { assertExposable } from '@errors'

const DaoController = {
  getDaosWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IDaoExtraParams = {},
  ): Promise<IPaginatedResult<IDaoResponse>> => {
    const result = await Models.Dao.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((dao: Dao) => dao.filterKeys())
    return result
  },

  getDaoById: async (id: string): Promise<IDaoResponse> => {
    const dao = await Models.Dao.findByEntityId(id)
    assertExposable(dao, ErrorKeyEnum.notFound)

    return dao.filterKeys()
  },
}

export default DaoController
