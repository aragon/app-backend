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

    const hasOnlyDaoAndNetwork = extraParams.daoAddress && extraParams.network && !extraParams.tokenAddress

    if (hasOnlyDaoAndNetwork) {
      const dao = await Models.Dao.findByAddress(extraParams.daoAddress, extraParams.network)
      if (dao?.subDaos?.length) {
        extraParams.daoAddresses = [extraParams.daoAddress, ...dao.subDaos]
      }
    }

    return await Models.Asset.findWithPagination({ extraParams, paginationParams })
  },
}

export default AssetController
