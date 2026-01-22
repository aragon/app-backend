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

    const hasOnlyDaoAndNetwork = extraParams.daoAddress && extraParams.network && !extraParams.tokenAddress

    if (hasOnlyDaoAndNetwork) {
      const dao = await Models.Dao.findByAddress(extraParams.daoAddress, extraParams.network)
      if (dao?.subDaos?.length && !extraParams.onlyParent) {
        extraParams.daoAddresses = [extraParams.daoAddress, ...dao.subDaos]
      }
    }

    return Models.Asset.findWithPagination({ extraParams, paginationParams })
  },
}

export default AssetController
