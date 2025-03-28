import { NetworksEnum } from '@src/types/networks'
import { AlchemyProvider } from '@providers/assetTransafersProvider/alchemyProvider'
import { SubscanProvider } from '@providers/assetTransafersProvider/subscanProvider'
import type Dao from '@models/schema/dao'
import { type IAssetTransferTxLog, type ITransactionType } from '@types'

export class AssetTransferProvider {
  public static async getAssetTransfers(
    dao: Dao,
    onTx: (txLog: IAssetTransferTxLog, side: ITransactionType, dao: Dao) => Promise<void>,
  ): Promise<any> {
    switch (dao.network) {
      case NetworksEnum.peaqMainnet:
        return SubscanProvider.getAssetTransfers(dao, onTx)
      default:
        return AlchemyProvider.getAssetTransfers(dao, onTx)
    }
  }
}

export default AssetTransferProvider
