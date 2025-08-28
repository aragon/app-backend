import axios from 'axios'
import logger from '@logger'
import config from '@config'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { ISimulationStatus, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tenderly-module' })

const TenderlyModule = {
  baseUrl() {
    return `${config.TENDERLY.API_URL}/account/${config.TENDERLY.USER}/project/${config.TENDERLY.PROJECT}`
  },

  async rpcCall(baseUrl: string, data?: any, headers?: Record<string, string>): Promise<any> {
    try {
      const response = await BottleneckModule.getTenderlyLimiter().schedule(async () =>
        axios.post(baseUrl, data, {
          headers: {
            'X-Access-Key': config.TENDERLY.ACCESS_KEY,
            'Content-Type': 'application/json',
            ...headers,
          },
          timeout: 30000,
        }),
      )
      return response.data
    } catch (error: any) {
      logger.error('Tenderly RPC call failed', llo({ baseUrl, error: error.message }))
    }
  },

  isConfigured(): boolean {
    return !!(config.TENDERLY.PROJECT && config.TENDERLY.USER && config.TENDERLY.ACCESS_KEY)
  },

  async createShareableUrl(simulationId: string): Promise<string | false> {
    if (!TenderlyModule.isConfigured()) {
      return false
    }

    const response = await TenderlyModule.rpcCall(`${TenderlyModule.baseUrl()}/simulations/${simulationId}/share`)
    return response.share_url || `https://www.tdly.co/shared/simulation/${simulationId}`
  },

  async simulate(
    simulation: { to: string; data: string; value?: string; from: string },
    network: NetworksEnum,
  ): Promise<
    | boolean
    | {
        url?: string | undefined
        runAt?: number | undefined
        status?: ISimulationStatus
      }
  > {
    if (!TenderlyModule.isConfigured()) {
      return false
    }

    const simulationData = {
      network_id: ProviderModule.getChainId(network).toString(),
      from: simulation.from,
      input: simulation.data,
      to: simulation.to,
      gas: 8000000,
      gas_price: '0',
      value: '0',
      save: true,
    }

    const response = await TenderlyModule.rpcCall(`${TenderlyModule.baseUrl()}/simulate`, simulationData)

    const runAt = Date.now()

    if (response?.simulation?.id) {
      const shareableUrl = await TenderlyModule.createShareableUrl(response.simulation.id)
      const status =
        response?.transaction?.error_info?.error_message !== '' ? ISimulationStatus.FAILED : ISimulationStatus.SUCCESS
      return {
        url: shareableUrl || undefined,
        runAt,
        status,
      }
    }

    return false
  },
}

export default TenderlyModule
