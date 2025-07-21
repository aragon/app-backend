import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'helpers:RouteScanHelper' })

const RouteScanHelper = {
  axiosInstance: (chainId: number, urlSegments = '') => {
    const url = `${config.ROUTESCAN_API.BASE_URI}/${chainId}/${urlSegments || 'etherscan/api'}`

    return axios.create({
      baseURL: url,
      headers: { 'Content-Type': 'application/json' },
    })
  },

  _rpCall: async (params: object, network: NetworksEnum, urlSegments = '') => {
    try {
      const chainId = ProviderModule.getChainId(network)
      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () =>
          RouteScanHelper.axiosInstance(chainId, urlSegments).get('', { params }),
        ),
      )
      return response?.data
    } catch (error) {
      logger.error('Error in RouteScan API call', llo({ error }))
      throw error
    }
  },

  fetchTokenHoldersCount: async ({ address, network }): Promise<number> => {
    const params = {
      count: true,
      limit: 1,
    }

    const urlSegments = `erc20/${address}/holders`

    try {
      const result = await RouteScanHelper._rpCall(params, network, urlSegments)
      if (result.items?.length && result.count) {
        return result.count
      }
    } catch (e: any) {
      logger.warn('Error fetching token holders count from RouteScan', llo({ params, network, error: e }))
    }

    return 0
  },
}

export default RouteScanHelper
