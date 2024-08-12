import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type IEtherScanSource, type NetworksEnum } from '@types'
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'helpers:EtherscanHelper' })

const EtherscanHelper = {
  axiosInstance: axios.create({
    baseURL: 'https://api.etherscan.io/api', // Base URL for Etherscan API
    headers: { 'Content-Type': 'application/json' },
  }),

  _rpCall: async (params: object) => {
    try {
      const response = await EtherscanHelper.axiosInstance.get('', { params })
      return response.data.result
    } catch (error) {
      logger.error('Error in Etherscan API call', llo({ error }))
      throw error
    }
  },

  fetchAllTransactions: async (contractAddress: string, startBlock = 0, endBlock = 'latest') => {
    const apiKey = config.ETHERSCAN.API_KEY
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
      return await EtherscanHelper._rpCall(params)
    } catch (error) {
      logger.error('Error in Etherscan API call', llo({ error }))
      throw error
    }
  },

  fetchContractSourceCode: async (contractAddress: string, network: NetworksEnum): Promise<IEtherScanSource | null> => {
    const networkConfigKey = network.replace('-', '_').toUpperCase()
    const etherscanConfig = config.ETHERSCAN_API[networkConfigKey]

    if (!etherscanConfig?.API_KEY) {
      logger.error('Etherscan API config not found', llo({ network }))
      return null
    }

    const apiKey = etherscanConfig.API_KEY
    const baseUrl =
      etherscanConfig.API_URL +
      `?module=contract&action=getsourcecode&address=${contractAddress.toLowerCase()}&apikey=${apiKey}`
    await Utils.wait(1000)
    try {
      const response = await axios.get(baseUrl)
      const results = response.data.result[0]
      return results.SourceCode ? response.data.result[0] : null
    } catch (e) {
      logger.error('Error in Etherscan API call', llo({ error: e }))
      return null
    }
  },
}

export default EtherscanHelper
