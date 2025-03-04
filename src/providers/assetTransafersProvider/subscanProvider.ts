import {
  type IAssetTransferProvider,
  type IAssetTransferTxLog,
  type ITransactionCategory,
  ITransactionType,
} from '@types'
import SubscanApi from '@helpers/subscanApi'
import { ethers } from 'ethers'
import type Dao from '@models/schema/dao'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'

export const SubscanProvider: IAssetTransferProvider = {
  async getAssetTransfers(
    dao: Dao,
    onTx: (txLog: IAssetTransferTxLog, side: ITransactionType, dao: Dao) => Promise<void>,
  ) {
    const assetTransfers = await SubscanApi.getAssetTransfer(dao.address, dao.network)
    await Promise.all(
      assetTransfers.map(async tx => {
        const contractAddress = tx.rawContract?.address || utils.zeroAddress
        const tokenInfo = await ProxyToken.saveAndGetToken(contractAddress, dao.network)

        if (!tokenInfo) {
          return
        }

        const transferLog: IAssetTransferTxLog = {
          from: tx.from,
          to: tx.to,
          value: tx.value,
          blockNum: tx.blockNum,
          blockTimestamp: tx.blockTimestamp,
          hash: tx.hash,
          category: tx.category as ITransactionCategory,
          uniqueId: tx.uniqueId,
          rawContract: {
            address: contractAddress,
            decimals: tokenInfo.decimals,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            priceUsd: tokenInfo.priceUsd,
            priceUpdatedAt: tx.blockTimestamp,
            type: tokenInfo.type,
          },
        }

        if (ProxyToken.analyzeIfScamToken(tokenInfo.name, tokenInfo.symbol)) {
          return
        }

        transferLog.value =
          tx.category === 'external' ? tx.value : ethers.formatUnits(tx.value, tx?.rawContract?.decimals || 0)
        const transactionType = tx.from === dao.address ? ITransactionType.withdraw : ITransactionType.deposit

        await onTx(transferLog, transactionType, dao)
      }),
    )
  },
}
