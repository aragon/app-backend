import logger from '@logger'
import axios from 'axios'
import config from '@config'

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
}

export default EtherscanHelper
