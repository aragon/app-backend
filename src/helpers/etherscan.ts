import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type HexAddress, type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'helpers:EtherscanHelper' })

const EtherscanHelper = {
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

  fetchAllTransactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const params = {
      module: 'account',
      action: 'txlist',
      address: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
    }

    try {
      return await EtherscanHelper._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetchAllTransactions', llo({ error }))
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
      if (response && response.status === '1') {
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
