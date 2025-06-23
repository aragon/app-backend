import logger from '@logger'
import axios, { type AxiosInstance } from 'axios'
import config from '@config'
import { type HexAddress, type IEtherScanSource, type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'modules:EthersProvider' })

interface EthersProviderOptions {
  baseUrl?: string
  apiKey?: string
}

interface TokenPrice {
  usdPrice: string
  lastUpdated: string
}

interface TransactionQueryParams {
  address: HexAddress
  startBlock?: number | string
  endBlock?: number | string
  page?: number
  offset?: number
  sort?: 'asc' | 'desc'
  network: NetworksEnum
}

interface TokenTransferQueryParams extends TransactionQueryParams {
  contractAddress?: HexAddress
}

class EthersProvider {
  private readonly axiosInstance: AxiosInstance
  private readonly apiKey: string

  constructor(options?: EthersProviderOptions) {
    this.apiKey = options?.apiKey || config.ETHERSCAN_API.API_KEY

    this.axiosInstance = axios.create({
      baseURL: options?.baseUrl || config.ETHERSCAN_API.BASE_URI,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async _rpCall(params: Record<string, unknown>, network: NetworksEnum): Promise<any> {
    try {
      const requestParams = {
        ...params,
        apikey: this.apiKey,
        chainid: ProviderModule.getChainId(network),
      }

      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () =>
          this.axiosInstance.get('', { params: requestParams }),
        ),
      )

      if (response?.data?.status === '0' && response?.data?.message !== 'No transactions found') {
        logger.warn(
          'Etherscan API returned error',
          llo({
            message: response?.data?.message,
            result: response?.data?.result,
            params: requestParams,
          }),
        )
      }

      return response?.data?.result
    } catch (error) {
      logger.error('Error in Etherscan API call', llo({ error, params }))
      throw error
    }
  }

  /**
   * Fetch contract source code for a given address
   */
  async fetchContractSourceCode(
    contractAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<IEtherScanSource[] | null> {
    const params = {
      module: 'contract',
      action: 'getsourcecode',
      address: contractAddress,
    }

    try {
      return await this._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetching contract source code', llo({ contractAddress, network, error }))
      return null
    }
  }

  /**
   * Fetch native token (ETH, MATIC, etc.) current price in USD
   */
  async fetchNativeTokenPrice(network: NetworksEnum): Promise<TokenPrice | null> {
    const params = {
      module: 'stats',
      action: 'ethprice',
    }

    try {
      const result = await this._rpCall(params, network)
      if (result) {
        return {
          usdPrice: result.ethusd || '0',
          lastUpdated: result.ethusd_timestamp || '',
        }
      }
      return null
    } catch (error) {
      logger.error('Error fetching native token price', llo({ network, error }))
      return null
    }
  }

  /**
   * Fetch token holders information
   */
  async fetchTokenHolders(
    tokenAddress: HexAddress,
    network: NetworksEnum,
    page = 1,
    offset = 100,
  ): Promise<any | null> {
    const params = {
      module: 'token',
      action: 'tokenholderlist',
      contractaddress: tokenAddress,
      page,
      offset,
    }

    try {
      return await this._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetching token holders', llo({ tokenAddress, network, error }))
      return null
    }
  }

  /**
   * Fetch internal transactions for an address
   */
  async fetchInternalTransactions({
    address,
    startBlock = 0,
    endBlock = 'latest',
    page = 1,
    offset = 100,
    sort = 'asc',
    network,
  }: TransactionQueryParams): Promise<any | null> {
    const params = {
      module: 'account',
      action: 'txlistinternal',
      address,
      startblock: startBlock,
      endblock: endBlock,
      page,
      offset,
      sort,
    }

    try {
      return await this._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetching internal transactions', llo({ address, network, error }))
      return null
    }
  }

  /**
   * Fetch all transactions for an address
   */
  async fetchTransactions({
    address,
    startBlock = 0,
    endBlock = 'latest',
    page = 1,
    offset = 100,
    sort = 'asc',
    network,
  }: TransactionQueryParams): Promise<any | null> {
    const params = {
      module: 'account',
      action: 'txlist',
      address,
      startblock: startBlock,
      endblock: endBlock,
      page,
      offset,
      sort,
    }

    try {
      return await this._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetching transactions', llo({ address, network, error }))
      return null
    }
  }

  /**
   * Fetch ERC20 token transfers for an address
   */
  async fetchTokenTransfers({
    address,
    contractAddress,
    startBlock = 0,
    endBlock = 'latest',
    page = 1,
    offset = 100,
    sort = 'asc',
    network,
  }: TokenTransferQueryParams): Promise<any | null> {
    const params = {
      module: 'account',
      action: 'tokentx',
      address,
      contractaddress: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      page,
      offset,
      sort,
    }

    try {
      return await this._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetching token transfers', llo({ address, contractAddress, network, error }))
      return null
    }
  }

  /**
   * Fetch token information including supply, decimals, etc.
   */
  async fetchTokenInfo(tokenAddress: HexAddress, network: NetworksEnum): Promise<any | null> {
    const params = {
      module: 'token',
      action: 'tokeninfo',
      contractaddress: tokenAddress,
    }

    try {
      return await this._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetching token info', llo({ tokenAddress, network, error }))
      return null
    }
  }

  /**
   * Fetch contract ABI
   */
  async fetchContractABI(contractAddress: HexAddress, network: NetworksEnum): Promise<string | null> {
    const params = {
      module: 'contract',
      action: 'getabi',
      address: contractAddress,
    }

    try {
      const result = await this._rpCall(params, network)
      return typeof result === 'string' ? result : null
    } catch (error) {
      logger.error('Error fetching contract ABI', llo({ contractAddress, network, error }))
      return null
    }
  }

  /**
   * Fetch contract creation information
   */
  async fetchContractCreation(contractAddress: HexAddress, network: NetworksEnum): Promise<any[]> {
    const params = {
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: contractAddress,
    }

    try {
      return (await this._rpCall(params, network)) || []
    } catch (error) {
      logger.error('Error fetching contract creation info', llo({ contractAddress, network, error }))
      return []
    }
  }
}

// Export both the class and a singleton instance
export const ethersProvider = new EthersProvider()
export default EthersProvider
