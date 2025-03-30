import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import {
  type HexAddress,
  type ISubScanAssetTransfer,
  type ISubScanContractCreation,
  type ISubScanNativeTokenInfo,
  type ISubScanTokenBalance,
  type ISubScanTokenInfo,
  ITokenType,
  type NetworksEnum,
} from '@types'
import { ethers } from 'ethers'
import utils from '@helpers/utils'
import dayjs from '@helpers/dayjs'

const llo = logger.logMeta.bind(null, { service: 'helpers:SubscanApiHelper' })

const SubscanApiHelper = {
  axiosInstance: (network: NetworksEnum) =>
    axios.create({
      baseURL: SubscanApiHelper._parseNetworkToConfig(network).SUBSCAN_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': SubscanApiHelper._parseNetworkToConfig(network).SUBSCAN_API_KEY || undefined,
      },
    }),

  _parseNetworkToConfig: (network: NetworksEnum) => {
    const networkConfigKey = network.replace('-', '_').toUpperCase()
    return config.NODES[networkConfigKey]
  },

  _rpCall: async (path: string, params: object, network: NetworksEnum, replacedPath?: any) => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getBlockScoutLimiter(network).schedule(async () =>
          SubscanApiHelper.axiosInstance(network).post(replacedPath || `api/scan/${path}`, params),
        ),
      )
      return response?.data
    } catch (error) {
      logger.warn('SubscanApi API call', llo({ error, path, params }))
      throw error
    }
  },

  getContractSourceCode: async (address: string, network: NetworksEnum) => {
    const path = 'evm/contract'
    const params = {
      address,
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data) {
        const toReturn = {
          SourceCode: response.data.source_code,
          ABI: JSON.stringify(response.data.abi),
          ContractName: response.data.contract_name,
        }
        return [toReturn]
      }
    } catch (error) {
      logger.warn('SubscanApi getContractSourceCode', llo({ error, address }))
    }
  },

  async fetchContractCreation(
    contractAddress: string,
    network: NetworksEnum,
  ): Promise<ISubScanContractCreation | null> {
    const path = 'evm/contract'
    const params = {
      address: contractAddress,
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data) {
        return {
          address: contractAddress,
          transactionHash: response.data.transaction_hash,
          blockNumber: response.data.block_num,
        }
      }
    } catch (error) {
      logger.warn('SubscanApi getContractSourceCode', llo({ error, address: contractAddress }))
    }

    return null
  },

  async getTokenFullDetails(address: HexAddress, network: NetworksEnum): Promise<ISubScanTokenInfo> {
    const tokenDetails: ISubScanTokenInfo = {
      address,
      decimals: null,
      name: null,
      symbol: null,
      priceUsd: '0',
      priceChangeOnDayUsd: '0',
      type: ITokenType.unknown,
      logo: null,
      lastUpdatedAt: null,
      totalSupply: '0',
      totalHolders: 0,
    }
    try {
      const path = 'evm/tokens'
      const params = {
        contracts: [address],
      }
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data && response.data.list?.length > 0) {
        const tokenInfo = response.data.list[0]

        tokenDetails.totalSupply = tokenInfo.totalSupply
        tokenDetails.totalHolders = tokenInfo.holders
        tokenDetails.name = tokenInfo.name
        tokenDetails.symbol = tokenInfo.symbol
        tokenDetails.decimals = tokenInfo.decimals
        tokenDetails.priceUsd = tokenInfo.price
        tokenDetails.lastUpdatedAt = dayjs.utc().toDate()

        switch (tokenInfo.category) {
          case 'erc20':
            tokenDetails.type = ITokenType.ERC20
            break
          case 'erc721':
            tokenDetails.type = ITokenType.ERC721
            break
          case 'erc1155':
            tokenDetails.type = ITokenType.ERC1155
            break
          default:
            tokenDetails.type = ITokenType.unknown
        }
      }
    } catch (error) {
      logger.warn('SubscanApi getTokenSupplyAndHolders', llo({ error, address }))
    }

    return tokenDetails
  },

  getAccountBalance: async (address: HexAddress, network: NetworksEnum): Promise<ISubScanTokenBalance[]> => {
    const apiEndpoint = 'account/tokens'
    const queryParams = {
      address,
      row: 100,
    }

    try {
      const response = await SubscanApiHelper._rpCall(apiEndpoint, queryParams, network)
      if (response?.data?.native && response.data.ERC20) {
        return response.data.ERC20.map((token: any) => ({
          contractAddress: ethers.getAddress(token.contract), // Fixed key name
          tokenBalance: token.balance,
          decimals: token.decimals,
          name: token.name,
          symbol: token.symbol,
        }))
      }
    } catch (error) {
      logger.warn('SubscanApi fetchTokenBalances', { error, address })
    }

    return []
  },

  getAccountInfoByKey: async (address: HexAddress, network: NetworksEnum): Promise<string | undefined> => {
    const path = 'search'
    const params = {
      key: address,
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data?.account.substrate_account?.address) {
        return response.data.account.substrate_account.address
      }
    } catch (error) {
      logger.warn('SubscanApi getAccountInfoByKey', llo({ error, address }))
    }
  },

  getAssetTransfer: async (address: HexAddress, network: NetworksEnum): Promise<ISubScanAssetTransfer[]> => {
    // Convert to Substrate Address
    const substrateAddress = await SubscanApiHelper.getAccountInfoByKey(address, network)
    if (!substrateAddress) {
      return []
    }

    const nativeTransferEndpoint = 'transfers'
    const nativeQueryParams = {
      page: 0,
      row: 100,
      address: substrateAddress,
    }

    let allTransfers: ISubScanAssetTransfer[] = []

    try {
      const response = await SubscanApiHelper._rpCall(
        nativeTransferEndpoint,
        nativeQueryParams,
        network,
        'api/v2/scan/transfers',
      )

      if (response?.data?.transfers) {
        allTransfers = response.data.transfers.map((transfer: any) => ({
          blockNum: transfer.block_num,
          from: ethers.getAddress(transfer.from_account_display.evm_address || ethers.ZeroAddress),
          to: ethers.getAddress(transfer.to_account_display?.evm_address || ethers.ZeroAddress),
          uniqueId: transfer.transfer_id,
          blockTimestamp: transfer.block_timestamp,
          value: transfer.amount,
          hash: transfer.hash,
          category: 'external',
          decimals: 18,
        }))
      }
    } catch (error) {
      logger.warn('SubscanApi fetchAssetTransfers (native)', { error, address })
    }

    // ERC20 Transfers
    const erc20QueryParams = {
      address,
      row: 100,
      page: 0,
      category: 'erc20',
    }

    const erc20TransferEndpoint = 'evm/token/transfer'

    try {
      const response = await SubscanApiHelper._rpCall(erc20TransferEndpoint, erc20QueryParams, network)

      if (response?.data?.list) {
        const tokenTransferDetails: ISubScanAssetTransfer[] = await Promise.all(
          response.data.list.map(async (transfer: any) => {
            const txDetails = await SubscanApiHelper.getTransactionInfoByHash(transfer.hash, network)
            return {
              blockNum: txDetails.block_num,
              from: ethers.getAddress(transfer.from),
              to: ethers.getAddress(transfer.to),
              uniqueId: transfer.id,
              blockTimestamp: txDetails.block_timestamp,
              value: transfer.value,
              hash: transfer.hash,
              category: 'erc20',
              rawContract: {
                value: transfer.value,
                address: ethers.getAddress(transfer.contract),
                decimals: transfer.decimals,
                name: transfer.name,
                symbol: transfer.symbol,
                priceUsd: '0',
              },
            }
          }),
        )

        allTransfers = allTransfers.concat(tokenTransferDetails).sort((a, b) => b.blockNum - a.blockNum)
      }
    } catch (error) {
      logger.warn('SubscanApi fetchAssetTransfers (ERC20)', { error, address })
    }

    return allTransfers
  },

  getTransactionInfoByHash: async (txHash: string, network: NetworksEnum) => {
    const path = 'evm/transaction'
    const params = {
      hash: txHash,
    }
    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data) {
        return response.data
      }
    } catch (error) {
      logger.warn('SubscanApi getTransactionInfoByHash', llo({ error, txHash }))
    }
  },

  getNativeTokenInfo: async (network: NetworksEnum): Promise<ISubScanNativeTokenInfo> => {
    const params = {
      include_extends: true,
    }

    const tokenResponse: ISubScanNativeTokenInfo = {
      address: utils.zeroAddress,
      name: 'PEAQ',
      symbol: 'PEAQ',
      decimals: 18,
      logo: null,
      priceUsd: '0',
      type: ITokenType.native,
      totalSupply: '0',
      totalHolders: 0,
    }

    try {
      const response = await SubscanApiHelper._rpCall('', params, network, 'api/v2/scan/token/native')
      if (response?.data?.token) {
        const price = await SubscanApiHelper.getCurrentPrice(network)

        tokenResponse.name = response.data.token.name
        tokenResponse.symbol = response.data.token.symbol
        tokenResponse.decimals = response.data.token.decimals
        tokenResponse.logo = null
        tokenResponse.priceUsd = price
        tokenResponse.totalSupply = response.data.token.total_supply
        tokenResponse.totalHolders = response.data.token.holders
      }
    } catch (error) {
      logger.warn('Error getNativeTokenInfo', llo({ error }))
    }
    return tokenResponse
  },

  getCurrentPrice: async (network: NetworksEnum): Promise<string> => {
    const path = 'price/history'
    const todayDate = new Date().toISOString().split('T')[0]
    const params = {
      start: todayDate,
      end: todayDate,
      format: 'day',
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data?.list) {
        return response.data.list[response.data.list.length - 1].price
      }
    } catch (error) {
      logger.warn('Error getCurrentPrice', llo({ error }))
    }
    return '0'
  },
}

export default SubscanApiHelper
