import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type HexAddress, type IEtherScanSource, type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

const llo = logger.logMeta.bind(null, { service: 'helpers:EtherscanHelper' })

const EtherscanHelper = {
  axiosInstance: (network: NetworksEnum) =>
    axios.create({
      baseURL: EtherscanHelper._parseNetworkToConfig(network).ETHERSCAN_API_URL,
      headers: { 'Content-Type': 'application/json' },
    }),

  _parseNetworkToConfig: (network: NetworksEnum) => {
    const networkConfigKey = network.replace('-', '_').toUpperCase()
    const etherscanConfig = config.NODES[networkConfigKey]
    return etherscanConfig
  },

  _rpCall: async (params: object, network: NetworksEnum) => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () =>
          EtherscanHelper.axiosInstance(network).get('', { params }),
        ),
      )
      return response?.data?.result
    } catch (error) {
      logger.error('Error in Etherscan API call', llo({ error }))
      throw error
    }
  },

  fetchAllTransactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).ETHERSCAN_API_KEY
    const params = {
      module: 'account',
      action: 'txlist',
      address: contractAddress,
      startblock: startBlock,
      endblock: endBlock,
      sort: 'asc',
      apikey: apiKey,
    }

    try {
      return await EtherscanHelper._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetchAllTransactions', llo({ error }))
      throw error
    }
  },

  fetchContractCreation: async ({
    contractAddress,
    network,
  }): Promise<[{ address: HexAddress; txHash: HexAddress }] | []> => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).ETHERSCAN_API_KEY
    const params = {
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: contractAddress,
      apikey: apiKey,
    }

    try {
      const result = await EtherscanHelper._rpCall(params, network)
      return result
    } catch (error) {
      return []
    }
  },

  fetchContractSourceCode: async ({ contractAddress, network }): Promise<IEtherScanSource[] | null> => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).ETHERSCAN_API_KEY
    const params = {
      module: 'contract',
      action: 'getsourcecode',
      address: contractAddress,
      apikey: apiKey,
    }

    try {
      return await EtherscanHelper._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetchContractSourceCode', llo({ params, network, error }))
      return null
    }
  },

  getTokenMetrics: async (address: HexAddress, network: NetworksEnum) => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).ETHERSCAN_API_KEY
    const params = {
      module: 'token',
      action: 'tokensupply',
      contractaddress: address,
      apikey: apiKey,
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
