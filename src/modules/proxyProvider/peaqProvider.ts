import SubscanApi from '@helpers/subscanApi'
import { type ISubScanTokenInfo, type IWeb3Provider } from '@types'
import utils from '@helpers/utils'
import logger from '@logger'
import { ethers } from 'ethers'

// eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
const llo = logger.logMeta.bind(null, { service: 'provider:PeaqTokenProvider' })

const PeaqProvider: Omit<IWeb3Provider, 'getNativeBalance'> = {
  getTokenBalances: async ({ address, network }) => {
    const tokens = await SubscanApi.getAccountBalance(address, network)
    return tokens.map((token: any) => ({
      tokenBalance: ethers.formatUnits(token.tokenBalance, token.decimals),
      contractAddress: ethers.getAddress(token.contractAddress),
    }))
  },

  async fetchContractCreation({ address, network }) {
    const contractInfo = await SubscanApi.fetchContractCreation(address, network)
    if (contractInfo) {
      return contractInfo
    }

    return { blockNumber: 0, transactionHash: null, address }
  },

  async fetchContractSourceCode({ address, network }) {
    return SubscanApi.getContractSourceCode(address, network)
  },

  async fetchBasicTokenInfo({ address, network }): Promise<Partial<ISubScanTokenInfo>> {
    const tokenInfo =
      address === utils.zeroAddress
        ? await SubscanApi.getNativeTokenInfo(network)
        : await SubscanApi.getTokenFullDetails(address, network)
    return tokenInfo
  },

  // async getAssetTransfers(
  //   dao: Dao,
  //   onTx: (txLog: IAssetTransferTxLog, side: ITransactionType, dao: Dao) => Promise<void>,
  // ) {
  //   const assetTransfers = await SubscanApi.getAssetTransfer(dao.address, dao.network)
  //   await Promise.all(
  //     assetTransfers.map(async tx => {
  //       const contractAddress = tx.rawContract?.address || utils.zeroAddress
  //       const tokenInfo = await ProxyToken.saveAndGetToken(contractAddress, dao.network)
  //
  //       if (!tokenInfo) {
  //         return
  //       }
  //
  //       const transferLog: IAssetTransferTxLog = {
  //         from: tx.from,
  //         to: tx.to,
  //         value: tx.value,
  //         blockNum: tx.blockNum,
  //         blockTimestamp: tx.blockTimestamp,
  //         hash: tx.hash,
  //         category: tx.category as ITransactionCategory,
  //         uniqueId: tx.uniqueId,
  //         rawContract: {
  //           address: contractAddress,
  //           decimals: tokenInfo.decimals,
  //           name: tokenInfo.name,
  //           symbol: tokenInfo.symbol,
  //           priceUsd: tokenInfo.priceUsd,
  //           priceUpdatedAt: tx.blockTimestamp,
  //           type: tokenInfo.type,
  //         },
  //       }
  //
  //       if (ProxyToken.analyzeIfScamToken(tokenInfo.name, tokenInfo.symbol)) {
  //         return
  //       }
  //
  //       transferLog.value =
  //         tx.category === 'external' ? tx.value : ethers.formatUnits(tx.value, tx?.rawContract?.decimals || 0)
  //       const transactionType = tx.from === dao.address ? ITransactionType.withdraw : ITransactionType.deposit
  //
  //       await onTx(transferLog, transactionType, dao)
  //     }),
  //   )
  // },
}

export default PeaqProvider
