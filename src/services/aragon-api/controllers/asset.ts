import { Models } from '@dbModels'
import PairDataModule from '@modules/pairData'
import {
  type IAssetExtraParams,
  type IAssetPaginatedResult,
  type IAssetResponse,
  type IPaginationParams,
  type IPairParams,
} from '@types'

const AssetController = {
  getAssetsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IAssetExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IAssetPaginatedResult<IAssetResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    return await Models.Asset.findWithPagination({ extraParams, paginationParams })
  },
}

export default AssetController
