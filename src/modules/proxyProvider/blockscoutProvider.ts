import logger from '@logger'
import { ITransactionCategory, ITransactionType, type NetworksEnum } from '@types'
import utils from '@helpers/utils'
import { ethers } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import ProxyUtils from '@modules/proxyProvider/utils'
import BlockScoutHelper from '@helpers/blockScout'

const llo = logger.logMeta.bind(null, { service: 'provider:BlockScoutProvider' })

const BlockScoutProvider: Pick<any, 'fetchAddressTxns'> = {
  fetchAddressTxns: async ({ address, network }: { address: string; network: NetworksEnum }) => {
    try {
      const [erc20Transfers, externalTransfers, internalTxs] = await Promise.all([
        BlockScoutHelper._fetchERC20Transfers(address, network),
        BlockScoutHelper._fetchTxList(address, network),
        BlockScoutHelper._fetchInternalTxs(address, network),
      ])

      const allTransactions = [...erc20Transfers, ...externalTransfers, ...internalTxs]

      const parsedTransfers = await Promise.all(
        allTransactions.map(async tx => {
          const contractAddress = tx.contractAddress || utils.zeroAddress
          const tokenInfo = await ProxyToken.saveAndGetToken(contractAddress, network)

          if (!tokenInfo) {
            return
          }

          if (TokenUtils.analyzeIfScamToken(tokenInfo?.name || '', tokenInfo?.symbol || '')) {
            return
          }

          return {
            from: ethers.getAddress(tx.from),
            to: ethers.getAddress(tx.to),
            value: ethers.formatUnits(tx.value, tokenInfo.decimals),
            blockNum: parseInt(tx.blockNumber),
            blockTimestamp: parseInt(tx.timestamp.toString()),
            hash: tx.hash,
            category: tx.contractAddress
              ? ITransactionCategory.ERC20
              : tx.category === 'external'
                ? ITransactionCategory.External
                : ITransactionCategory.Internal,
            uniqueId: `${tx.hash}-${tx.category}-${tx.index || tx.transactionIndex || tx.logIndex || '0'}`,
            rawContract: {
              address: contractAddress,
              decimals: tokenInfo.decimals,
              name: tokenInfo.name,
              symbol: tokenInfo.symbol,
              priceUsd: tokenInfo.priceUsd,
              priceUpdatedAt: parseInt(tx.timestamp.toString()),
              type: tokenInfo.type,
            },
            type:
              tx.from.toLowerCase() === address.toLowerCase() ? ITransactionType.withdraw : ITransactionType.deposit,
          }
        }),
      )

      const sortedTxList = parsedTransfers.filter(Boolean).sort((a: any, b: any) => a.blockNum - b.blockNum)
      await ProxyUtils.updateProgressInConfigIndexer(
        network,
        `transferList-${address}-${network}`,
        sortedTxList[sortedTxList.length - 1]?.blockNum || 0,
      )
      return sortedTxList
    } catch (error) {
      logger.error('Error in fetchAddressTxns', llo({ error, address, network }))
      return []
    }
  },
}

export default BlockScoutProvider
