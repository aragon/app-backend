import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { type HexAddress, ITokenType, NetworksEnum } from '@types'
import { ethers } from 'ethers'
import utils from '@helpers/utils'

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
  isPeaqNetwork: (network: NetworksEnum) => network === NetworksEnum.peaqMainnet,

  _rpCall: async (path: string, params: object, network: NetworksEnum, replacedPath?: any) => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getBlockScoutLimiter(network)!.schedule(async () =>
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

  async getTokenFullDetails(address: HexAddress, network: NetworksEnum) {
    const tokenDetails = {
      address,
      name: null,
      symbol: null,
      decimals: 0,
      type: ITokenType.unknown,
      totalSupply: 0,
      totalHolders: 0,
      priceUsd: '0',
      logo: '',
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

  getAccountBalance: async (address: HexAddress, network: NetworksEnum) => {
    const path = 'account/tokens'
    const params = {
      address,
      row: 100,
    }

    const toReturn = {
      native: '0',
      erc20: [],
    } as {
      native: string
      erc20: Array<{
        contractAddress: HexAddress
        tokenBalance: string
      }>
    }

    try {
      const response = await SubscanApiHelper._rpCall(path, params, network)
      if (response?.data?.native && response.data.ERC20) {
        toReturn.native = response.data.native[0].balance
        toReturn.erc20 = response.data.ERC20.map((token: any) => ({
          contract: ethers.getAddress(token.contract),
          tokenBalance: token.balance,
        }))
      }
    } catch (error) {
      logger.warn('SubscanApi getAccountBalance', llo({ error, address }))
    }

    return toReturn
  },

  getAccountInfoByKey: async (address: HexAddress, network: NetworksEnum) => {
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

  getAssetTransfer: async (address: HexAddress, network: NetworksEnum) => {
    // first native transfers
    const substrateAddress = await SubscanApiHelper.getAccountInfoByKey(address, network)
    if (!substrateAddress) {
      return []
    }
    const nativeTransferPath = 'transfers'

    const nativeTxParams = {
      page: 0,
      row: 100,
      address: substrateAddress,
    }

    let transfers = []

    try {
      const response = await SubscanApiHelper._rpCall(
        nativeTransferPath,
        nativeTxParams,
        network,
        'api/v2/scan/transfers',
      )
      if (response?.data?.transfers) {
        transfers = response.data.transfers.map((transfer: any) => ({
          blockNum: transfer.block_num,
          from: ethers.getAddress(transfer.from_account_display.evm_address),
          to: ethers.getAddress(transfer.to_account_display?.evm_address || utils.zeroAddress),
          uniqueId: transfer.transfer_id,
          blockTimestamp: transfer.block_timestamp,
          value: transfer.amount,
          hash: transfer.hash,
          category: 'external',
        }))
      }
    } catch (error) {
      logger.warn('SubscanApi getAssetTransfer', llo({ error, address }))
    }

    const erc20Transfers = {
      address,
      row: 100,
      page: 0,
      category: 'erc20',
    }

    const erc20TransferPath = 'evm/token/transfer'

    try {
      const response = await SubscanApiHelper._rpCall(erc20TransferPath, erc20Transfers, network)
      if (response?.data?.list) {
        const tokenTransferDetails = await Promise.all(
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
              },
            }
          }),
        )

        transfers = transfers.concat(tokenTransferDetails as any).sort((a: any, b: any) => b.blockNum - a.blockNum)
      }
    } catch (error) {
      logger.warn('SubscanApi getAssetTransfer', llo({ error, address }))
    }

    return transfers
  },

  async getTransactionInfoByHash(txHash: string, network: NetworksEnum) {
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

  getNativeTokenInfo: async (network: NetworksEnum) => {
    const params = {
      include_extends: true,
    }

    try {
      const response = await SubscanApiHelper._rpCall('', params, network, 'api/v2/scan/token/native')
      if (response?.data?.token) {
        const price = await SubscanApiHelper.getCurrentPrice(network)

        return {
          address: utils.zeroAddress,
          name: response.data.token.name,
          symbol: response.data.token.symbol,
          decimals: response.data.token.decimals,
          logo: '',
          priceUsd: price,
          type: ITokenType.native,
          totalSupply: '0',
          totalHolders: 0,
        }
      }
    } catch (error) {
      logger.warn('Error getNativeTokenInfo', llo({ error }))
    }
  },

  getCurrentPrice: async (network: NetworksEnum) => {
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
