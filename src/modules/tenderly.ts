import axios from 'axios'
import logger from '@logger'
import config from '@config'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type NetworksEnum, type TenderlySimulationSimulationItem } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tenderly-module' })

const TenderlyModule = {
  baseUrl() {
    return `${config.TENDERLY.API_URL}/account/${config.TENDERLY.USER}/project/${config.TENDERLY.PROJECT}`
  },

  async rpcCall(baseUrl: string, data: any, headers?: Record<string, string>): Promise<any> {
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

    const response = await TenderlyModule.rpcCall(`${TenderlyModule.baseUrl()}/simulation/${simulationId}/share`, {})
    return response.share_url || `https://www.tdly.co/shared/simulation/${simulationId}`
  },

  async simulateBundle(
    simulations: Array<{ to: string; data?: string; value?: string; from?: string }>,
    network: NetworksEnum,
  ): Promise<
    | boolean
    | {
        url?: string | undefined
        runAt?: number | undefined
      }
  > {
    if (!TenderlyModule.isConfigured()) {
      return false
    }

    const preparedSimulations = TenderlyModule.prepareSimulationItems(simulations, network)
    const response = await TenderlyModule.rpcCall(`${TenderlyModule.baseUrl()}/simulate-bundle`, {
      simulations: preparedSimulations,
    })

    const runAt = Date.now()

    if (response?.status === 'success') {
      const shareableUrl = await TenderlyModule.createShareableUrl(response.simulation_id)
      return {
        url: shareableUrl || undefined,
        runAt,
      }
    }

    return false
  },

  prepareSimulationItems(
    actions: Array<{ to: string; data?: string; value?: string; from?: string }>,
    network?: NetworksEnum,
  ): TenderlySimulationSimulationItem[] {
    return actions.map(action => ({
      network_id: network ? ProviderModule.getChainId(network).toString() : '1',
      save: true,
      save_if_fails: true,
      simulation_type: 'full',
      to: action.to || '0x',
      from: action.from,
      input: action.data || '0x',
      value: action.value || '0',
    }))
  },
}

export default TenderlyModule
