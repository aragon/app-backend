import logger from '@logger'
import { ITransactionCategory, ITransactionType, NetworksEnum, ITokenType } from '@types'
import utils from '@helpers/utils'
import { ethers } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'
import TokenUtils from '@helpers/tokenUtils'
import ProxyUtils from '@modules/proxyProvider/utils'
import BlockScoutHelper from '@helpers/blockScout'

const llo = logger.logMeta.bind(null, { service: 'provider:BlockScoutProvider' })

const BlockScoutProvider: Pick<any, 'fetchAddressTxns' | 'getTokenBalances' | 'fetchBasicTokenInfo'> = {
  getTokenBalances: async ({ address, network }: { address: string; network: NetworksEnum }) => {
    try {
      const tokenBalances = await BlockScoutHelper.getTokenBalances(address, network)

      const parsedBalances = await Promise.all(
        tokenBalances.map(async (tokenBalance: any) => {
          if (tokenBalance.tokenBalance === utils.emptyData) return null

          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          if (TokenUtils.analyzeIfScamToken(token?.name || '', token?.symbol || '')) {
            return null
          }

          return {
            contractAddress: ethers.getAddress(tokenBalance.contractAddress),
            tokenBalance: ethers.formatUnits(tokenBalance.tokenBalance, token.decimals),
            originalBalance: tokenBalance.tokenBalance,
          }
        }),
      )

      return parsedBalances.filter(Boolean)
    } catch (error) {
      logger.error('Error in getTokenBalances', llo({ error, address, network }))
      return []
    }
  },

  fetchAddressTxns: async ({ address, network }: { address: string; network: NetworksEnum }) => {
    try {
      const [erc20Transfers, externalTransfers] = await Promise.all([
        BlockScoutHelper._fetchERC20Transfers(address, network),
        BlockScoutHelper._fetchTxList(address, network),
      ])

      const allTransactions = [...erc20Transfers, ...externalTransfers]

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
            category: tx.contractAddress ? ITransactionCategory.ERC20 : ITransactionCategory.External,
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

  fetchBasicTokenInfo: async ({ address, network }: { address: string; network: NetworksEnum }) => {
    const tokenInfo = {
      address,
      name: null,
      symbol: null,
      decimals: 0,
      type: ITokenType.unknown,
      logo: null,
      priceUsd: '0',
      totalSupply: '0',
      totalHolders: '0',
    } as any

    if (address === utils.zeroAddress) {
      const nativeTokenMap: Record<string, { name: string; symbol: string }> = {
        [NetworksEnum.cornMainnet]: { name: 'Corn', symbol: 'CORN' },
      }

      const nativeToken = nativeTokenMap[network] || { name: 'Native Token', symbol: 'NATIVE' }
      tokenInfo.name = nativeToken.name
      tokenInfo.symbol = nativeToken.symbol
      tokenInfo.decimals = 18
      tokenInfo.type = ITokenType.native

      return tokenInfo
    }

    try {
      const tokenDetails = await BlockScoutHelper.getTokenFullDetails(address, network)

      if (tokenDetails) {
        tokenInfo.name = tokenDetails.name || null
        tokenInfo.symbol = tokenDetails.symbol || null
        tokenInfo.decimals = tokenDetails.decimals || 0
        tokenInfo.type = tokenDetails.type || ITokenType.unknown
        tokenInfo.logo = tokenDetails.logo || null
        tokenInfo.priceUsd = tokenDetails.priceUsd || '0'
        tokenInfo.totalSupply = tokenDetails.totalSupply || '0'
        tokenInfo.totalHolders = tokenDetails.totalHolders?.toString() || '0'
      }
    } catch (error) {
      logger.warn('BlockScout Provider basic token info failed', llo({ error, address, network }))
    }

    return tokenInfo
  },
}

export default BlockScoutProvider
