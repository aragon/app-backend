import { Models } from '@dbModels'
import TenderlyModule from '@modules/tenderly'
import { SimulationStatus } from '@models/schema/simulation'
import logger from '@logger'
import { 
  type NetworksEnum, 
  type TenderlySimulationSimulationItem, 
  IPluginStatus,
  ErrorKeyEnum 
} from '@types'
import { assertExposable } from '@errors'
import crypto from 'crypto'

const llo = logger.logMeta.bind(null, { service: 'simulation-controller' })

export interface ISimulationResponse {
  status: SimulationStatus
  url?: string
  runAt: string
  errorMessage?: string
  network?: NetworksEnum
}

class SimulationController {
  /**
   * Simulate a bundle of transactions
   * This validates that recipients are DAOs and senders are plugins
   */
  static async simulateBundle(
    actions: Array<{ to: string; data?: string; value?: string; from?: string }>,
    network?: NetworksEnum
  ): Promise<ISimulationResponse> {
    try {
      if (!TenderlyModule.isConfigured()) {
        return {
          status: SimulationStatus.FAILED,
          runAt: new Date().toISOString(),
          errorMessage: 'Tenderly service not available',
        }
      }

      if (!actions || actions.length === 0) {
        return {
          status: SimulationStatus.FAILED,
          runAt: new Date().toISOString(),
          errorMessage: 'No actions provided',
        }
      }

      // Validate to addresses are DAOs
      const toAddresses = actions.map(action => action.to).filter(Boolean)
      const fromAddresses = actions.map(action => action.from).filter(Boolean)

      // Validate recipients are DAOs
      const daos = await Models.Dao.find({
        address: { $in: toAddresses },
        isActive: true,
        isHidden: { $ne: true },
      }).lean()

      const daoAddresses = daos.map((dao: { address: string }) => dao.address.toLowerCase())
      const invalidRecipients = toAddresses.filter(addr => !daoAddresses.includes(addr.toLowerCase()))

      if (invalidRecipients.length > 0) {
        return {
          status: SimulationStatus.FAILED,
          runAt: new Date().toISOString(),
          errorMessage: 'Invalid recipients: recipients must be valid DAOs',
        }
      }

      // Validate senders are plugins (if specified)
      if (fromAddresses.length > 0) {
        const plugins = await Models.Plugin.find({
          address: { $in: fromAddresses },
          status: IPluginStatus.installed,
          isSupported: true,
        }).lean()

        const pluginAddresses = plugins.map((plugin: { address: string }) => plugin.address.toLowerCase())
        const invalidSenders = fromAddresses.filter(addr => !pluginAddresses.includes(addr.toLowerCase()))

        if (invalidSenders.length > 0) {
          return {
            status: SimulationStatus.FAILED,
            runAt: new Date().toISOString(),
            errorMessage: 'Invalid senders: senders must be valid plugins',
          }
        }
      }

      // Convert actions to Tenderly simulation items
      const simulationItems = TenderlyModule.prepareSimulationItems(actions, network)

      // Send to Tenderly
      const result = await TenderlyModule.simulateBundle(simulationItems)

      // Find existing simulation with the same actions or create a new one
      const existingSimulation = await Models.Simulation.findByActionsHash(actions)
      let simulation

      if (existingSimulation) {
        // Update existing simulation
        existingSimulation.status = result.status
        existingSimulation.url = result.url
        existingSimulation.errorMessage = result.errorMessage
        existingSimulation.tenderlyResponse = result.tenderlyResponse
        existingSimulation.runAt = new Date()
        simulation = await existingSimulation.save()
      } else {
        // Create new simulation with hash-based ID
        simulation = await Models.Simulation.create({
          status: result.status,
          url: result.url,
          errorMessage: result.errorMessage,
          tenderlyResponse: result.tenderlyResponse,
          actions: actions,
          network,
          runAt: new Date(),
          id: Models.Simulation.generateId(undefined, actions),
        })
      }

      return {
        status: result.status,
        url: result.url,
        runAt: simulation.runAt.toISOString(),
        errorMessage: result.errorMessage,
        network: simulation.network,
      }
    } catch (error: any) {
      logger.error('Failed to run simulation bundle', llo({ error: error.message }))
      throw error
    }
  }

  /**
   * Get the latest simulation by proposalId, simulationId, or actions
   * @param params Object containing one of: proposalId, simulationId, or actions
   */
  static async getLastSimulation(params: {
    proposalId?: string;
    simulationId?: string;
    actions?: Array<{ to: string; data?: string; value?: string; from?: string }>;
  }): Promise<ISimulationResponse | null> {
    try {
      const { proposalId, simulationId, actions } = params
      let simulation = null

      // First try to find by simulationId if provided
      if (simulationId) {
        simulation = await Models.Simulation.findBySimulationId(simulationId)
      }
      
      // Then try to find by proposalId if provided
      if (!simulation && proposalId) {
        simulation = await Models.Simulation.findByProposalId(proposalId)
      }

      // Finally try to find by actions hash if provided
      if (!simulation && actions && actions.length > 0) {
        simulation = await Models.Simulation.findByActionsHash(actions)
      }

      if (!simulation) {
        return null
      }

      return {
        status: simulation.status,
        url: simulation.url,
        runAt: simulation.runAt.toISOString(),
        errorMessage: simulation.errorMessage,
        network: simulation.network,
      }
    } catch (error: any) {
      logger.error('Failed to get last simulation', llo({ params, error: error.message }))
      throw error
    }
  }

  /**
   * Run a new simulation for a proposal
   * This method retrieves the proposal's actions and simulates them
   */
  static async runNewSimulation(proposalId: string, network?: NetworksEnum): Promise<ISimulationResponse> {
    try {
      if (!TenderlyModule.isConfigured()) {
        return {
          status: SimulationStatus.FAILED,
          runAt: new Date().toISOString(),
          errorMessage: 'Tenderly service not available',
          network,
        }
      }

      // Find the proposal to get its actions
      const proposal = await Models.Proposal.findByEntityId(proposalId)
      if (!proposal) {
        return {
          status: SimulationStatus.FAILED,
          runAt: new Date().toISOString(),
          errorMessage: 'Proposal not found',
          network,
        }
      }

      if (!proposal.rawActions || proposal.rawActions.length === 0) {
        return {
          status: SimulationStatus.FAILED,
          runAt: new Date().toISOString(),
          errorMessage: 'No actions to simulate in proposal',
          network,
        }
      }

      // Create or update simulation record with running status
      const runningSimulation = await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.RUNNING,
        network: network || proposal.network,
      })

      // Run simulation in the background
      this.runProposalSimulationAsync(proposalId, proposal.rawActions, network || proposal.network)
        .catch(error => {
          logger.error('Async simulation failed', llo({ proposalId, network, error: error.message }))
        })

      // Return running status immediately
      return {
        status: runningSimulation.status,
        url: runningSimulation.url,
        runAt: runningSimulation.runAt.toISOString(),
        network: runningSimulation.network,
      }
    } catch (error: any) {
      logger.error('Failed to run new simulation', llo({ proposalId, error: error.message }))
      throw error
    }
  }

  /**
   * Run proposal simulation asynchronously and update the database when done
   * This is a private method used by runNewSimulation
   */
  private static async runProposalSimulationAsync(
    proposalId: string,
    actions: any[],
    network: NetworksEnum
  ): Promise<void> {
    try {
      // Run the simulation
      const result = await this.simulateBundle(actions, network)

      // Update the simulation record
      await Models.Simulation.upsertByProposalId(proposalId, {
        status: result.status,
        url: result.url,
        errorMessage: result.errorMessage,
        network,
      })

      logger.info('Simulation completed for proposal', llo({ proposalId, status: result.status }))
    } catch (error: any) {
      logger.error('Failed to run simulation for proposal', llo({ proposalId, error: error.message }))

      // Update the simulation record with failure
      await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.FAILED,
        errorMessage: error.message || 'Unknown error',
      })
    }
  }
}

export default SimulationController
