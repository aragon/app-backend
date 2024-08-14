import logger from '@logger'
import axios from 'axios'
import config from '@config'
import {HexAddress, type IEtherScanSource, type NetworksEnum} from '@types'
import {retryRequest} from "@helpers/retryRequest";
import BottleneckModule from "@modules/bottleneck";

const llo = logger.logMeta.bind(null, { service: 'helpers:EtherscanHelper' })

const EtherscanHelper = {
  axiosInstance: (network: NetworksEnum) =>
    axios.create({
      baseURL: EtherscanHelper._parseNetworkToConfig(network).API_URL,
      headers: { 'Content-Type': 'application/json' },
    }),

  _parseNetworkToConfig: (network: NetworksEnum) => {
    const networkConfigKey = network.replace('-', '_').toUpperCase()
    const etherscanConfig = config.ETHERSCAN_API[networkConfigKey]
    return etherscanConfig
  },

  _rpCall: async (params: object, network: NetworksEnum) => {
    try {

      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network)!.schedule(async () =>
          EtherscanHelper.axiosInstance(network).get('', { params })
        ),
      )

      return response.data.result
    } catch (error) {
      logger.error('Error in Etherscan API call', llo({ error }))
      throw error
    }
  },

  fetchAllTransactions: async ({ contractAddress, startBlock = 0, endBlock = 'latest', network }) => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).API_KEY
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

  fetchContractCreation: async ({ contractAddress, network }): Promise<[{address: HexAddress, txHash: HexAddress}] | []> => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).API_KEY
    const params = {
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: contractAddress,
      apikey: apiKey,
    }

    try {
      return await EtherscanHelper._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetchAllTransactions', llo({ error }))
      return []
    }
  },

  fetchContractSourceCode: async ({
    contractAddress,
    network,
  }): Promise<IEtherScanSource | null> => {
    const apiKey = EtherscanHelper._parseNetworkToConfig(network).API_KEY
    const params = {
      module: 'contract',
      action: 'getsourcecode',
      address: contractAddress,
      apikey: apiKey,
    }

    try {
      return await EtherscanHelper._rpCall(params, network)
    } catch (error) {
      logger.error('Error fetchContractSourceCode', llo({ error }))
      throw error
    }
  },
}

export default EtherscanHelper
