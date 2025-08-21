import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type HexAddress, type IEtherScanSource, type IWeb3ContractCreation, NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:EvmExplorerClient' })

export enum EvmExplorerEnum {
  ETHERSCAN = 'etherscan',
  ROUTESCAN = 'routescan',
  CHILIZ = 'chiliz',
  BLOCKSCOUT = 'blockscout',
  ZKSYNC = 'zksync',
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
    [EvmExplorerEnum.BLOCKSCOUT]: {
      buildUrlAndParams: (network: NetworksEnum, customParams = {}, _urlSegments = '') => {
        const networkConfig = config.NODES[utils.networkToAragon(network)]
        if (networkConfig.BLOCKSCOUT_API_KEY === undefined) {
          return null
        }

        return {
          url: `${networkConfig.BLOCKSCOUT_API_URL}`,
          params: {
            ...customParams,
            apikey: networkConfig.BLOCKSCOUT_API_KEY,
          },
        }
      },
    },
    [EvmExplorerEnum.CHILIZ]: {
      buildUrlAndParams: (_network: NetworksEnum, customParams = {}, _urlSegments = '') => {
        const baseUrl = `${config.CHILIZ_API_URL}/api`
        return {
          url: baseUrl,
          params: {
            ...customParams,
          },
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
  }

  private async apiCall(explorerType: EvmExplorerEnum, params: object, network: NetworksEnum, urlSegments = '') {
    try {
      const explorerConfig = this.configs[explorerType]
      if (!explorerConfig) {
        return null
      }

      const { url, params: requestParams } = explorerConfig.buildUrlAndParams(network, params, urlSegments) as {
        url: string
        params: object
      }

      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () => axios.get(url, { params: requestParams })),
      )

      return response?.data
    } catch (error) {
      logger.error(`Error in ${explorerType} API call`, llo({ error, params, urlSegments }))
      throw error
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
      logger.error(`Error fetching contract source code from ${explorerType}`, llo({ error, address, network }))
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
      return this.parseContractCreationResponse(result, address)
    } catch (error) {
      logger.error(`Error fetching contract creation from ${explorerType}`, llo({ error, address, network }))
      return { blockNumber: 0, transactionHash: '', address }
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
}

export const evmExplorerClient = new EvmExplorerClient()
