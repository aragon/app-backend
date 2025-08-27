import axios from 'axios'
import logger from '@logger'
import { Models } from '@dbModels'
import { SimulationStatus } from '@models/schema/simulation'
import config from '@config'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type TenderlySimulationResponse,
  type NetworksEnum,
  type TenderlySimulationBundleRequest,
  type TenderlySimulationSimulationItem,
  IPluginStatus,
  ErrorKeyEnum,
} from '@types'
import { assertExposable } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'tenderly' })

class TenderlyService {
  static isConfigured(): boolean {
    return !!(config.TENDERLY.PROJECT && config.TENDERLY.USER && config.TENDERLY.ACCESS_KEY)
  }

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

  static async simulateProposalActions(
    proposalId: string,
    network?: NetworksEnum,
  ): Promise<{ status: SimulationStatus; url?: string; errorMessage?: string; tenderlyResponse?: string }> {
    try {
      const proposal = await Models.Proposal.findByEntityId(proposalId)
      if (!proposal) {
        return { status: SimulationStatus.FAILED, errorMessage: 'Proposal not found' }
      }

      if (!proposal.rawActions || proposal.rawActions.length === 0) {
        return { status: SimulationStatus.FAILED, errorMessage: 'No actions to simulate' }
      }

      const simulationNetwork = network || proposal.network

      // Convert raw actions to simulation items
      const simulationItems: TenderlySimulationSimulationItem[] = proposal.rawActions.map((action: any) => ({
        network_id: simulationNetwork ? ProviderModule.getChainId(simulationNetwork).toString() : '1',
        save: true,
        save_if_fails: true,
        simulation_type: 'full',
        to: action.to || '0x',
        input: action.data || '0x',
        value: action.value || '0',
      }))

      return await this.simulateBundle(simulationItems)
    } catch (error: any) {
      logger.error('Failed to simulate proposal actions', llo({ proposalId, error: error.message }))
      return {
        status: SimulationStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      }
    }
  }

  static async runSimulationForProposal(proposalId: string, network?: NetworksEnum): Promise<void> {
    try {
      const result = await this.simulateProposalActions(proposalId, network)

      await Models.Simulation.upsertByProposalId(proposalId, {
        status: result.status,
        url: result.url,
        errorMessage: result.errorMessage,
        tenderlyResponse: result.tenderlyResponse,
        network,
      })

      logger.info('Simulation completed for proposal', llo({ proposalId, status: result.status }))
    } catch (error: any) {
      logger.error('Failed to run simulation for proposal', llo({ proposalId, error: error.message }))

      await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      })
    }
  }

  static async simulateBundle(
    simulations: TenderlySimulationSimulationItem[],
  ): Promise<{ status: SimulationStatus; url?: string; errorMessage?: string; tenderlyResponse?: string }> {
    if (!this.isConfigured()) {
      logger.error('Tenderly configuration missing', llo({}))
      return { status: SimulationStatus.FAILED, errorMessage: 'Tenderly service not configured' }
    }

    try {
      const toAddresses = simulations.map(sim => sim.to).filter(Boolean)
      const fromAddresses = simulations.map(sim => sim.from).filter(Boolean)

      if (toAddresses.length !== simulations.length || fromAddresses.length !== simulations.length) {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

      const daos = await Models.Dao.find({
        address: { $in: toAddresses },
        isActive: true,
        isHidden: { $ne: true },
      }).lean()

      const daoAddresses = daos.map((dao: { address: string }) => dao.address.toLowerCase())
      const invalidRecipients = toAddresses.filter(addr => !daoAddresses.includes(addr))

      if (invalidRecipients.length > 0) {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

      const plugins = await Models.Plugin.find({
        address: { $in: fromAddresses },
        status: IPluginStatus.installed,
        isSupported: true,
      }).lean()

      const pluginAddresses = plugins.map((plugin: { address: string }) => plugin.address.toLowerCase())
      const invalidSenders = fromAddresses.filter(addr => !pluginAddresses.includes(addr))

      if (invalidSenders.length > 0) {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

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

  static async simulateActions(
    actions: any[],
    network?: NetworksEnum,
  ): Promise<{ status: SimulationStatus; url?: string; errorMessage?: string; tenderlyResponse?: string }> {
    try {
      const simulationItems: TenderlySimulationSimulationItem[] = actions.map((action: any) => ({
        network_id: network ? ProviderModule.getChainId(network).toString() : '1',
        save: true,
        save_if_fails: true,
        simulation_type: 'full',
        to: action.to || '0x',
        input: action.data || '0x',
        value: action.value || '0',
      }))

      return await this.simulateBundle(simulationItems)
    } catch (error: any) {
      logger.error('Failed to simulate actions', llo({ error: error.message }))
      return {
        status: SimulationStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      }
    }
  }

  static async runSimulationForActions(
    actions: any[],
    network?: NetworksEnum,
  ): Promise<{ status: SimulationStatus; url?: string; errorMessage?: string }> {
    try {
      const simulationItems: TenderlySimulationSimulationItem[] = actions.map((action: any) => ({
        network_id: network ? ProviderModule.getChainId(network).toString() : '1',
        save: true,
        save_if_fails: true,
        simulation_type: 'full',
        to: action.to || '0x',
        input: action.data || '0x',
        value: action.value || '0',
      }))

      const result = await this.simulateBundle(simulationItems)

      const simulation = await Models.Simulation.create({
        status: result.status,
        url: result.url,
        errorMessage: result.errorMessage,
        tenderlyResponse: result.tenderlyResponse,
        actions,
        network,
      })

      logger.info('Simulation completed for actions', llo({ simulationId: simulation.id, status: result.status }))

      return {
        status: result.status,
        url: result.url,
        errorMessage: result.errorMessage,
      }
    } catch (error: any) {
      logger.error('Failed to run simulation for actions', llo({ error: error.message }))
      return {
        status: SimulationStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      }
    }
  }
}

export { TenderlyService }
