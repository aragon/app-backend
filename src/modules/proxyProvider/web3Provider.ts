import Alchemy from '@helpers/alchemy'
import BlockScoutHelper from '@helpers/blockScout'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { type IWeb3Provider, type IWeb3TokenBalance, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

const Web3Provider: IWeb3Provider = {
  getNativeBalance: async ({ address, network }) => {
    const balance = await Web3Helper.getNativeBalance(address, network)
    if (!Number(balance)) {
      return '0'
    }

    const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)

    if (!token) {
      logger.error('token not found balance 0', llo())
      return '0'
    }

    const parsedBalance = Alchemy.handleAlchemyCrazyBalance(balance, token?.decimals)
    Alchemy.alchemyCrazyBalanceOnError(address, token?.address, network, balance, token?.decimals)
    return parsedBalance
  },

  getTokenBalances: async ({ address, network }) => {
    const tokensBalance = await Web3Helper.getTokenBalances(address, network)

    return (
      await Promise.all(
        tokensBalance.map(async (tokenBalance: IWeb3TokenBalance) => {
          if (tokenBalance.tokenBalance === utils.emptyData) return null

          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: Alchemy.handleAlchemyCrazyBalance(tokenBalance.tokenBalance, token?.decimals),
            originalBalance: tokenBalance.tokenBalance,
          }
        }),
      )
    ).filter(Boolean) as IWeb3TokenBalance[]
  },

  fetchContractCreation: async ({ address, network }) => {
    const explorers = [EvmExplorerEnum.BLOCKSCOUT, EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet || network === NetworksEnum.zksyncSepolia) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }

    const result = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractCreation(explorerType, address, network)
      },
      {
        validate: (result: any) => !!result?.transactionHash,
        onError: (error: any, explorerType: any, index: any) => {
          logger.warn(
            `Failed to fetch contract creation from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    return result || { blockNumber: 0, transactionHash: null, address }
  },

  fetchContractSourceCode: async ({ address, network }) => {
    const explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.BLOCKSCOUT, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet || network === NetworksEnum.zksyncSepolia) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    const result = await utils.fallbackCall(
      explorers,
      async (explorerType: EvmExplorerEnum) => {
        return await evmExplorerClient.fetchContractSourceCode(explorerType, address, network)
      },
      {
        validate: (result: any) => !!result,
        onError: (error: any, explorerType: any, index: any) => {
          logger.warn(
            `Failed to fetch contract source code from ${explorerType}`,
            llo({
              error: error.message,
              address,
              network,
              explorerType,
              attemptIndex: index,
            }),
          )
        },
      },
    )

    return result || null
  },

  searchDetailsOfContract: async ({ address, network }) => {
    return await BlockScoutHelper.searchDetails(address, network)
  },
}

export default Web3Provider
