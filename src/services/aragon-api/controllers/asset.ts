import { Models } from '@dbModels'
import { type IAssetExtraParams, type IAssetResponse, type IPaginatedResult, type IPaginationParams } from '@types'

const AssetController = {
  getAssetsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IAssetExtraParams = {},
  ): Promise<IPaginatedResult<IAssetResponse>> => {
    return await Models.Asset.findWithPagination({ extraParams, paginationParams })
  },
}

export default AssetController
