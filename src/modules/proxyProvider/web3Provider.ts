import { ERC20 } from '@artifacts/ERC20'
import { Models } from '@dbModels'
import Alchemy from '@helpers/alchemy'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import {
  type HexAddress,
  IContractAddressType,
  ITransactionType,
  type IWeb3Provider,
  type IWeb3TokenBalance,
  NetworksEnum,
} from '@types'
import { Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyWeb3' })

// Discover ERC20 holdings from the DAO's own Transaction history and read each
// balance via a direct `balanceOf` eth_call. Used as a fallback for chains where
// Alchemy's Enhanced API is not enabled — e.g. Citrea returns
// `-32600 EAPIs not enabled on specified network: [CITREA_MAINNET]`, which
// Web3Helper.getTokenBalances swallows into an empty array.
//
// Only tokens the crawler has already seen a Transfer event for are covered.
// That's acceptable because (a) new holdings first appear via a Transfer, and
// (b) Alchemy's Enhanced API is itself just an index of those same events.
async function getTokenBalancesFromTxHistory(address: HexAddress, network: NetworksEnum): Promise<IWeb3TokenBalance[]> {
  const knownTokenAddresses: HexAddress[] = await Models.Transaction.distinct('tokenAddress', {
    daoAddress: address,
    network,
    type: ITransactionType.erc20,
    tokenAddress: { $ne: utils.zeroAddress },
  })

  if (knownTokenAddresses.length === 0) {
    return []
  }

  const provider = ProviderModule.getAnyRpcProvider(network)
  const limiter = BottleneckModule.getNodeLimiter(network)
  const iface = new Interface(ERC20.abi)
  const callData = iface.encodeFunctionData('balanceOf', [address])

  const balances = await Promise.all(
    knownTokenAddresses.map(async (tokenAddress: HexAddress) => {
      try {
        const raw = await retryRequest(async () =>
          limiter.schedule(async () => provider.call({ to: tokenAddress, data: callData })),
        )
        const [balance] = iface.decodeFunctionResult('balanceOf', raw)
        if (balance === 0n) return null
        return {
          contractAddress: tokenAddress,
          tokenBalance: balance.toString(),
        } as IWeb3TokenBalance
      } catch (error) {
        logger.warn(
          'Failed to read ERC20 balance via balanceOf fallback',
          llo({ address, tokenAddress, network, error: (error as Error).message }),
        )
        return null
      }
    }),
  )

  return balances.filter((b): b is IWeb3TokenBalance => b !== null)
}

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
    let tokensBalance = await Web3Helper.getTokenBalances(address, network)

    // Web3Helper.getTokenBalances swallows `-32600 EAPIs not enabled` into []
    // on chains where Alchemy's Enhanced API is disabled (e.g. Citrea). We
    // can't distinguish that from a DAO that genuinely holds no tokens, so
    // we always run the fallback on an empty result — it's a cheap DB
    // distinct() + one balanceOf per token the crawler has already seen.
    if (tokensBalance.length === 0) {
      tokensBalance = await getTokenBalancesFromTxHistory(address, network)
    }

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
    let explorers = [EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN]
    if (network === NetworksEnum.zksyncMainnet || network === NetworksEnum.zksyncSepolia) {
      explorers.unshift(EvmExplorerEnum.ZKSYNC)
    }
    if (network === NetworksEnum.citreaMainnet) {
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
    if (network === NetworksEnum.citreaMainnet) {
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
    if (network === NetworksEnum.citreaMainnet) {
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
