import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  type IEtherScanSource,
  type IWeb3ContractCreation,
  type IWeb3TokenBalance,
  NetworksEnum,
} from '@types'
import axios from 'axios'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:EvmExplorerClient' })

export enum EvmExplorerEnum {
  ETHERSCAN = 'etherscan',
  ROUTESCAN = 'routescan',
  ZKSYNC = 'zksync',
  BLOCKSCOUT = 'blockscout',
}

interface IExplorerConfig {
  buildUrlAndParams: (
    network: NetworksEnum,
    customParams?: object,
    urlSegments?: string,
  ) => {
    url: string
    params: object
  } | null
}

class EvmExplorerClient {
  private readonly configs: Record<any, IExplorerConfig> = {
    [EvmExplorerEnum.ETHERSCAN]: {
      buildUrlAndParams: (network: NetworksEnum, customParams = {}, _urlSegments = '') => ({
        url: config.ETHERSCAN_API.BASE_URI,
        params: {
          ...customParams,
          apikey: config.ETHERSCAN_API.API_KEY,
          chainid: ProviderModule.getChainId(network),
        },
      }),
    },
    [EvmExplorerEnum.ROUTESCAN]: {
      buildUrlAndParams: (network: NetworksEnum, customParams = {}, urlSegments = '') => {
        const chainId = ProviderModule.getChainId(network)
        return {
          url: `${config.ROUTESCAN_API.BASE_URI}/${chainId}/${urlSegments || 'etherscan/api'}`,
          params: customParams,
        }
      },
    },
    [EvmExplorerEnum.ZKSYNC]: {
      buildUrlAndParams: (network: NetworksEnum, customParams = {}, _urlSegments = '') => {
        const networkKeyName = network === NetworksEnum.zksyncMainnet ? 'MAINNET_BASE_URI' : 'SEPOLIA_BASE_URI'
        const baseUrl = config.ZKSYNC_BLOCK_EXPLORER_API[networkKeyName]
        return {
          url: baseUrl,
          params: {
            ...customParams,
          },
        }
      },
    },
    [EvmExplorerEnum.BLOCKSCOUT]: {
      buildUrlAndParams: (network: NetworksEnum, customParams = {}, _urlSegments = '') => {
        const urlMap: Partial<Record<NetworksEnum, string>> = {
          [NetworksEnum.citreaMainnet]: config.BLOCKSCOUT_EXPLORER_API.CITREA_MAINNET_BASE_URI,
        }
        const baseUrl = urlMap[network]
        if (!baseUrl) return null
        return {
          url: baseUrl,
          params: {
            ...customParams,
          },
        }
      },
    },
  }

  private async apiCall(explorerType: EvmExplorerEnum, params: object, network: NetworksEnum, urlSegments = '') {
    try {
      const explorerConfig = this.configs[explorerType]
      if (!explorerConfig) {
        return null
      }

      const result = explorerConfig.buildUrlAndParams(network, params, urlSegments)
      if (!result) {
        return null
      }

      const { url, params: requestParams } = result as {
        url: string
        params: object
      }

      const limiter =
        explorerType === EvmExplorerEnum.ROUTESCAN
          ? BottleneckModule.getRouteScanLimiter(network)
          : BottleneckModule.getEtherScanLimiter(network)

      const response = await retryRequest(async () =>
        limiter.schedule(async () => axios.get(url, { params: requestParams })),
      )

      return response?.data
    } catch (error) {
      logger.warn('Error API call evm explorer', llo({ error, params, urlSegments, explorerType }))
      throw error
    }
  }

  async getTokenBalances(
    explorerType: EvmExplorerEnum,
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<IWeb3TokenBalance[]> {
    // Blockscout's Etherscan-compat layer (?module=account&action=addresstokenbalance)
    // returns 400 on some deployments (confirmed on Citrea mainnet). The modern
    // REST v2 endpoint is supported on every current Blockscout release and
    // returns strictly-typed ERC-20 / ERC-721 / ERC-1155 balances in one shot.
    if (explorerType === EvmExplorerEnum.BLOCKSCOUT) {
      return this.getBlockscoutV2TokenBalances(address, network)
    }

    try {
      const params = {
        module: 'account',
        action: 'addresstokenbalance',
        address,
      }

      const response = await this.apiCall(explorerType, params, network)

      return (
        response?.result
          ?.filter(
            (token: any) => token.TokenName.length > 0 && token.TokenSymbol.length > 0 && token.TokenDivisor.length > 0,
          )
          ?.map((token: any) => ({
            contractAddress: Web3Utils.parseAddress(token.TokenAddress) || token.TokenAddress,
            name: token.TokenName,
            symbol: token.TokenSymbol,
            decimals: Number(token.TokenDivisor),
            tokenBalance: utils.parseTokenBalance(token.TokenQuantity, Number(token.TokenDivisor)),
            originalBalance: token.TokenQuantity,
            priceUsd: token.TokenPriceUSD,
          })) ?? []
      )
    } catch (error) {
      logger.warn('Error fetching token balances', llo({ error, address, network, explorerType }))
      return []
    }
  }

  // Blockscout REST v2 token balances — filters to ERC-20 only (ERC-721 /
  // ERC-1155 entries have a populated `token_id` or `token_instance`). Balances
  // come back as base-unit strings which we normalize through the same
  // `parseTokenBalance` used by the legacy path so downstream callers see a
  // consistent shape.
  private async getBlockscoutV2TokenBalances(address: HexAddress, network: NetworksEnum): Promise<IWeb3TokenBalance[]> {
    try {
      const explorerConfig = this.configs[EvmExplorerEnum.BLOCKSCOUT]
      const result = explorerConfig?.buildUrlAndParams(network)
      if (!result) return []

      const url = `${result.url.replace(/\/api\/?$/, '')}/api/v2/addresses/${address}/token-balances`

      const limiter = BottleneckModule.getEtherScanLimiter(network)
      const response = await retryRequest(async () => limiter.schedule(async () => axios.get(url)))

      if (!Array.isArray(response?.data)) return []

      return response.data
        .filter(
          (entry: any) =>
            entry?.token?.type === 'ERC-20' &&
            entry.token_id === null &&
            typeof entry?.value === 'string' &&
            entry.value !== '0' &&
            entry.token.address_hash &&
            entry.token.decimals,
        )
        .map((entry: any) => {
          const decimals = Number(entry.token.decimals)
          return {
            contractAddress: Web3Utils.parseAddress(entry.token.address_hash) || entry.token.address_hash,
            name: entry.token.name,
            symbol: entry.token.symbol,
            decimals,
            tokenBalance: utils.parseTokenBalance(entry.value, decimals),
            originalBalance: entry.value,
            priceUsd: entry.token.exchange_rate ?? null,
          }
        })
    } catch (error) {
      logger.warn('Error fetching blockscout v2 token balances', llo({ error, address, network }))
      return []
    }
  }

  async fetchContractSourceCode(
    explorerType: EvmExplorerEnum,
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<IEtherScanSource[] | null> {
    try {
      const params = {
        module: 'contract',
        action: 'getsourcecode',
        address,
      }

      const response = await this.apiCall(explorerType, params, network)
      return this.parseSourceCodeResponse(response)
    } catch (error) {
      logger.warn('Error fetching contract source code', llo({ error, address, network, explorerType }))
      return null
    }
  }

  async fetchContractCreation(
    explorerType: EvmExplorerEnum,
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<IWeb3ContractCreation> {
    try {
      const params = {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: address,
      }

      const result = await this.apiCall(explorerType, params, network)
      const parsed = this.parseContractCreationResponse(result, address)

      if (parsed.transactionHash && !parsed.blockNumber) {
        const blockNumber = await this.getBlockNumberFromTxHash(parsed.transactionHash, network)
        return { ...parsed, blockNumber }
      }

      return parsed
    } catch (error) {
      logger.warn('Error fetching contract creation', llo({ error, address, network, explorerType }))
      return { blockNumber: 0, transactionHash: '', address }
    }
  }

  private async getBlockNumberFromTxHash(txHash: string, network: NetworksEnum): Promise<number> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const receipt = await provider.getTransactionReceipt(txHash)
      return receipt?.blockNumber || 0
    } catch (error) {
      logger.warn('Error fetching block number from tx hash', llo({ error, txHash, network }))
      return 0
    }
  }

  // Parser methods
  private parseSourceCodeResponse(response: any): IEtherScanSource[] | null {
    if (
      response?.status === '1' &&
      response?.message === 'OK' &&
      response?.result?.length > 0 &&
      response.result[0].SourceCode !== '' &&
      response.result[0].ABI !== undefined
    ) {
      const name = response.result[0].ContractName
      const ContractName = name.split(':').pop() || name
      return [
        {
          SourceCode: response.result[0].SourceCode,
          ContractName,
          ABI: response.result[0].ABI,
          CompilerVersion: response.result[0].CompilerVersion || response.result[0].CompilerType,
        },
      ]
    }
    return null
  }

  private parseContractCreationResponse(response: any, address: HexAddress): IWeb3ContractCreation {
    if (response?.status === '1' && response?.message === 'OK' && response?.result?.length > 0) {
      return {
        address: ethers.getAddress(response.result[0].contractAddress || address),
        transactionHash: response.result[0].txHash || '',
        blockNumber: response.result[0].blockNumber || 0,
      }
    }
    return { address, transactionHash: '', blockNumber: 0 }
  }

  async fetchTokenInfo(explorerType: EvmExplorerEnum, address: HexAddress, network: NetworksEnum) {
    try {
      const params = {
        module: 'token',
        action: 'tokeninfo',
        contractaddress: address,
      }

      const response = await this.apiCall(explorerType, params, network)
      return this.parseTokenInfoResponse(response)
    } catch (error) {
      logger.warn('Error fetching token info', llo({ error, address, network, explorerType }))
      return null
    }
  }

  async getBlockByTimestamp(
    explorerType: EvmExplorerEnum,
    timestamp: number,
    network: NetworksEnum,
    closest: 'before' | 'after' = 'before',
  ): Promise<number> {
    try {
      const params = {
        module: 'block',
        action: 'getblocknobytime',
        timestamp,
        closest,
      }

      const response = await this.apiCall(explorerType, params, network)

      if (response?.status === '1' && response?.result) {
        return Number(response.result)
      }

      logger.warn('getBlockByTimestamp: unexpected response', llo({ response, timestamp, network }))
      return 0
    } catch (error) {
      logger.warn('Error fetching block by timestamp', llo({ error, timestamp, network, explorerType }))
      return 0
    }
  }

  private parseTokenInfoResponse(response: any): any {
    if (response?.status === '1' && response?.message === 'OK' && response?.result?.length > 0) {
      return {
        name: response.result[0].tokenName,
        symbol: response.result[0].symbol,
        decimals: response.result[0].tokenDecimal || response.result[0].divisor || 0,
        priceUsd: response.result[0].tokenPriceUSD || '0',
        totalSupply: response.result[0].totalSupply || '0',
      }
    }
  }
}

export const evmExplorerClient = new EvmExplorerClient()
