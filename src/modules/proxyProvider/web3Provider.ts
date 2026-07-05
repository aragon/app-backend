import Alchemy from '@helpers/alchemy'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import { IContractAddressType, type IWeb3Provider, type IWeb3TokenBalance, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

const Web3Provider: IWeb3Provider = {
  getNativeBalance: async ({ address, network }) => {
    const balance = await Web3Helper.getNativeBalance(address, network)
    if (!balance || !Number(balance)) {
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
    // Alchemy's Enhanced API (`alchemy_getTokenBalances`) is disabled on some
    // networks Alchemy otherwise supports as an RPC provider. Citrea returns
    //   -32600 "EAPIs not enabled on specified network: [CITREA_MAINNET]"
    // Route such chains to their block explorer's token-balance endpoint.
    // Same pattern used for `fetchContractCreation` / `fetchContractSourceCode`
    // below, where Citrea is already routed to Blockscout.
    const useExplorer = network === NetworksEnum.citreaMainnet || network === NetworksEnum.hemiMainnet
    const rawBalances = useExplorer
      ? await evmExplorerClient.getTokenBalances(EvmExplorerEnum.BLOCKSCOUT, address, network)
      : await Web3Helper.getTokenBalances(address, network)

    return (
      await Promise.all(
        rawBalances.map(async (tokenBalance: IWeb3TokenBalance) => {
          if (tokenBalance.tokenBalance === utils.emptyData) return null

          const token = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, network)
          if (!token) return null

          // Alchemy returns hex-encoded raw base units that need decimal
          // parsing via `handleAlchemyCrazyBalance`. Blockscout v2 returns
          // already-parsed decimal strings (see
          // `evmExplorerClient.getBlockscoutV2TokenBalances`), so we pass
          // them through unchanged.
          const parsedBalance = useExplorer
            ? tokenBalance.tokenBalance
            : Alchemy.handleAlchemyCrazyBalance(tokenBalance.tokenBalance, token?.decimals)

          return {
            contractAddress: Web3Utils.parseAddress(tokenBalance.contractAddress) || tokenBalance.contractAddress,
            tokenBalance: parsedBalance,
            originalBalance: useExplorer ? tokenBalance.originalBalance : tokenBalance.tokenBalance,
          }
        }),
      )
    ).filter(Boolean) as IWeb3TokenBalance[]
  },

  fetchContractCreation: async ({ address, network }) => {
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet || network === NetworksEnum.zksyncSepolia) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (network === NetworksEnum.citreaMainnet || network === NetworksEnum.hemiMainnet) {
      explorers = [EvmExplorerEnum.BLOCKSCOUT]
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
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet || network === NetworksEnum.zksyncSepolia) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (network === NetworksEnum.citreaMainnet || network === NetworksEnum.hemiMainnet) {
      explorers = [EvmExplorerEnum.BLOCKSCOUT]
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
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet || network === NetworksEnum.zksyncSepolia) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (network === NetworksEnum.citreaMainnet || network === NetworksEnum.hemiMainnet) {
      explorers = [EvmExplorerEnum.BLOCKSCOUT]
    }

    const contractInfo = await utils.fallbackCall(
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

    if (!contractInfo || contractInfo.length === 0) {
      return {
        type: IContractAddressType.ADDRESS,
        name: null,
      }
    }

    return {
      type: IContractAddressType.ADDRESS,
      name: contractInfo[0].ContractName,
    }
  },
}

export default Web3Provider
