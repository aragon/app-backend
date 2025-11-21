import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type HexAddress, NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'helpers:EtherscanHelper' })

const EtherscanHelper = {
  nativeTokens: {
    [NetworksEnum.ethereumMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.ethereumSepolia]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.polygonMainnet]: '0x0000000000000000000000000000000000001010',
    [NetworksEnum.arbitrumMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.baseMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.zksyncMainnet]: '0x000000000000000000000000000000000000800A',
    [NetworksEnum.zksyncSepolia]: '0x000000000000000000000000000000000000800A',
    [NetworksEnum.optimismMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    [NetworksEnum.avaxMainnet]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },

  axiosInstance: () =>
    axios.create({
      baseURL: config.ETHERSCAN_API.BASE_URI,
      headers: { 'Content-Type': 'application/json' },
    }),

  _rpCall: async (params: object, network: NetworksEnum) => {
    try {
      params = {
        ...params,
        apikey: config.ETHERSCAN_API.API_KEY,
        chainid: ProviderModule.getChainId(network),
      }

      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () =>
          EtherscanHelper.axiosInstance().get('', { params }),
        ),
      )
      return response?.data?.result
    } catch (error) {
      logger.error('Error in Etherscan API call', llo({ error }))
      throw error
    }
  },

  fetchNormalTransactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const params = {
      module: 'account',
      action: 'txlist',
      address: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    }

    try {
      const txs = await EtherscanHelper._rpCall(params, network)
      return txs.filter(tx => BigInt(tx.value) > 0 && tx.methodId === '0x' && tx.isError !== '1')
    } catch (error) {
      logger.error('Error fetchNormalTransactions', llo({ error }))
      throw error
    }
  },

  fetchInternalTransactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const params = {
      module: 'account',
      action: 'txlistinternal',
      address: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    }

    try {
      const txs = await EtherscanHelper._rpCall(params, network)
      return txs.filter(tx => BigInt(tx.value) > 0 && tx.type === 'call' && tx.isError !== '1')
    } catch (error) {
      logger.error('Error fetchInternalTransactions', llo({ error }))
      throw error
    }
  },

  fetchErc721Transactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const params = {
      module: 'account',
      action: 'tokennfttx',
      address: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    }

    try {
      const txs = await EtherscanHelper._rpCall(params, network)
      return txs.filter(tx => tx.tokenID && tx.isError !== '1')
    } catch (error) {
      logger.error('Error fetchErc721Transactions', llo({ error }))
      throw error
    }
  },

  fetchErc20Transactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const params = {
      module: 'account',
      action: 'tokentx',
      address: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    }

    try {
      const txs = await EtherscanHelper._rpCall(params, network)
      return txs.filter((tx: { isError: string }) => tx.isError !== '1')
    } catch (error) {
      logger.error('Error fetchErc20Transactions', llo({ error }))
      throw error
    }
  },

  getTokenMetrics: async (address: HexAddress, network: NetworksEnum) => {
    const params = {
      module: 'token',
      action: 'tokensupply',
      contractaddress: address,
    }

    try {
      const response = await EtherscanHelper._rpCall({ ...params, action: 'tokensupply' }, network)
      if (response && response.status === '1' && response.result) {
        return response.result
      }
      return '0'
    } catch (error) {
      logger.error('Error getTokenMetrics', llo({ params, network, error }))
      return '0'
    }
  },
}

export default EtherscanHelper
