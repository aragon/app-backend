import axios from 'axios'
import logger from '@logger'
import config from '@config'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type TenderlySimulationResponse,
  type NetworksEnum,
  type TenderlySimulationBundleRequest,
  type TenderlySimulationSimulationItem,
} from '@types'
import { SimulationStatus } from '@models/schema/simulation'

const llo = logger.logMeta.bind(null, { service: 'tenderly-module' })

class TenderlyModule {
  /**
   * Check if Tenderly is properly configured in the environment
   */
  static isConfigured(): boolean {
    return !!(config.TENDERLY.PROJECT && config.TENDERLY.USER && config.TENDERLY.ACCESS_KEY)
  }

  /**
   * Create a shareable URL for a Tenderly simulation
   */
  static async createShareableUrl(simulationId: string): Promise<string | undefined> {
    try {
      const response = await BottleneckModule.getTenderlyLimiter().schedule(async () =>
        axios.post(
          `${config.TENDERLY.API_URL}/account/${config.TENDERLY.USER}/project/${config.TENDERLY.PROJECT}/simulations/${simulationId}/share`,
          {},
          {
            headers: {
              'X-Access-Key': config.TENDERLY.ACCESS_KEY,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          },
        ),
      )

      if (response.data.share_url) {
        return response.data.share_url
      } else {
        return `https://www.tdly.co/shared/simulation/${simulationId}`
      }
    } catch (error: any) {
      logger.error('Failed to create shareable URL', llo({ simulationId, error: error.message }))
      return `https://www.tdly.co/shared/simulation/${simulationId}`
    }
  }

  /**
   * Send a bundle of simulations to Tenderly
   * This is a pure API call without validation or DB interaction
   */
  static async simulateBundle(
    simulations: TenderlySimulationSimulationItem[],
  ): Promise<{ status: SimulationStatus; url?: string; errorMessage?: string; tenderlyResponse?: string }> {
    if (!this.isConfigured()) {
      logger.error('Tenderly configuration missing', llo({}))
      return { status: SimulationStatus.FAILED, errorMessage: 'Tenderly service not configured' }
    }

    try {
      const simulationRequest: TenderlySimulationBundleRequest = {
        simulations,
      }

      const response = await BottleneckModule.getTenderlyLimiter().schedule(async () =>
        axios.post<TenderlySimulationResponse>(
          `${config.TENDERLY.API_URL}/account/${config.TENDERLY.USER}/project/${config.TENDERLY.PROJECT}/simulate-bundle`,
          simulationRequest,
          {
            headers: {
              'X-Access-Key': config.TENDERLY.ACCESS_KEY,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          },
        ),
      )

      const tenderlyResponse = JSON.stringify(response.data)

      if (response.data.status === 'success') {
        const shareableUrl = await this.createShareableUrl(response.data.simulation_id)
        return {
          status: SimulationStatus.SUCCESS,
          url: shareableUrl,
          tenderlyResponse,
        }
      } else {
        return {
          status: SimulationStatus.FAILED,
          errorMessage: 'Simulation failed',
          tenderlyResponse,
        }
      }
    } catch (error: any) {
      logger.error('Tenderly bundle simulation failed', llo({ error: error.message }))
      return {
        status: SimulationStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      }
    }
  }

  /**
   * Convert actions to simulation items format
   */
  static prepareSimulationItems(
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
  }
}

export default TenderlyModule