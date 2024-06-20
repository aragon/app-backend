import { Models } from '@dbModels'
import { type IAssetExtraParams, type IAssetResponse, type IPaginatedResult, type IPaginationParams } from '@types'
import ModelUtils from '@models/utils/models'

const AssetController = {
  getAssetsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IAssetExtraParams = {},
    daoId?: string,
  ): Promise<IPaginatedResult<IAssetResponse>> => {
    if (daoId) {
      const daoDb = await Models.Dao.findByEntityId(daoId)
      if (!daoDb) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.daoAddress = daoDb.address
      extraParams.network = daoDb.network
    }

    return await Models.Asset.findWithPagination({ extraParams, paginationParams })
  },
}

export default AssetController
