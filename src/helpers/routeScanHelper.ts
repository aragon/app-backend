import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { type IEtherScanSource, type NetworksEnum } from '@types'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'helpers:RouteScanHelper' })

const RouteScanHelper = {
  axiosInstance: (chainId: number) =>
    axios.create({
      baseURL: `${config.ROUTESCAN_API.BASE_URI}/${chainId}/etherscan/api`,
      headers: { 'Content-Type': 'application/json' },
    }),

  _rpCall: async (params: object, network: NetworksEnum) => {
    try {
      const chainId = ProviderModule.getChainId(network)

      const response = await retryRequest(async () =>
        BottleneckModule.getEtherScanLimiter(network).schedule(async () =>
          RouteScanHelper.axiosInstance(chainId).get('', { params }),
        ),
      )
      return response?.data
    } catch (error) {
      logger.error('Error in RouteScan API call', llo({ error }))
      throw error
    }
  },

  fetchContractSourceCode: async ({ address, network }): Promise<IEtherScanSource[] | null> => {
    const params = {
      module: 'contract',
      action: 'getsourcecode',
      address,
    }

    try {
      const result = await RouteScanHelper._rpCall(params, network)
      if (
        result.status === '1' &&
        result.message === 'OK' &&
        result.result.length > 0 &&
        result.result[0].SourceCode !== ''
      ) {
        return [
          {
            SourceCode: result.result[0].SourceCode,
            ContractName: result.result[0].ContractName,
            ABI: result.result[0].ABI,
          },
        ]
      }
    } catch (error) {
      logger.error('Error fetchContractSourceCode from RouteScan', llo({ params, network, error }))
    }
    return null
  },
}

export default RouteScanHelper
