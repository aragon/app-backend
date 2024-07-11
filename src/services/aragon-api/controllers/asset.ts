import { Models } from '@dbModels'
import {
  type IAssetExtraParams,
  type IAssetResponse,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
} from '@types'
import PairDataModule from '@modules/pairData'

const AssetController = {
  getAssetsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: IAssetExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<IAssetResponse>> => {
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    return await Models.Asset.findWithPagination({ extraParams, paginationParams })
  },
}

export default AssetController
