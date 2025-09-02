import { Models } from '@dbModels'
import TenderlyModule from '@modules/tenderly'
import logger from '@logger'
import { type NetworksEnum, IPluginStatus, ErrorKeyEnum, ISimulationStatus } from '@types'
import * as Errors from '@errors'
import { Interface, ethers } from 'ethers'
import { DAO } from '@artifacts/dao'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'simulation-controller' })

class SimulationController {
  static async validateAction(pluginAddress: string, network: NetworksEnum) {
    const plugin = await Models.Plugin.findOne({
      address: pluginAddress,
      status: IPluginStatus.installed,
      network,
      isSupported: true,
    })

    Errors.assertExposable(
      plugin,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Invalid plugin: must be a valid installed plugin',
      llo({
        pluginAddress,
        network,
      }),
    )

    return plugin
  }

  /**
   * Run a simulation for actions by encoding them into DAO execute call
   * @param pluginAddress
   * @param actions
   * @param network
   */
  static async simulate(
    pluginAddress: string,
    actions: Array<{ data: string; value: string; to: string }>,
    network: NetworksEnum,
  ): Promise<any> {
    const plugin = await SimulationController.validateAction(pluginAddress, network)
    const encodedData = SimulationController.parseSimulationRequest(actions)

    const simulationAction = {
      to: plugin.daoAddress,
      data: encodedData,
      value: '0',
      from: pluginAddress,
    }

    const result = (await TenderlyModule.simulate(simulationAction, network)) as {
      url?: string
      runAt?: number
      status: ISimulationStatus
    }

    Errors.assertExposable(!!result, ErrorKeyEnum.badSimulationRequest, 400, 'Simulation Not Implemented', llo({}))

    return {
      status: result.status,
      url: result.url,
      runAt: result.runAt,
      network,
    }
  }

  /**
   * Run a simulation for a proposal's actions by encoding them into DAO execute call
   * @param proposalId
   */

  static async simulateProposal(proposalId: string): Promise<any> {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(
      proposal?.rawActions?.length,
      ErrorKeyEnum.notFound,
      404,
      'Proposal not found',
      llo({ proposalId }),
    )

    const encodedData = SimulationController.parseSimulationRequest(proposal.rawActions)

    const simulationAction = {
      to: proposal.daoAddress,
      data: encodedData,
      value: '0',
      from: proposal.pluginAddress,
    }

    const existingSimulation = proposal.simulation
    if (existingSimulation?.runAt) {
      const timeDiff = Date.now() - existingSimulation.runAt
      Errors.assertExposable(
        timeDiff > config.TENDERLY.RE_SIMULATION_TIME,
        ErrorKeyEnum.badSimulationRequest,
        400,
        'A simulation was run less than 10 minutes ago for this proposal',
        llo({ proposalId, network: proposal.network }),
      )
    }

    const result = (await TenderlyModule.simulate(simulationAction, proposal.network)) as {
      url?: string
      runAt?: number
      status: ISimulationStatus
    }

    Errors.assertExposable(
      !!result,
      ErrorKeyEnum.badSimulationRequest,
      404,
      'Simulation Not Implemented',
      llo({ proposalId, network: proposal.network }),
    )

    await proposal.update({
      simulation: {
        status: result.status,
        url: result.url,
        runAt: result.runAt ? new Date(result.runAt) : new Date(),
      },
    })

    return {
      status: result.status,
      url: result.url,
      runAt: result.runAt,
      network: proposal.network,
    }
  }

  /**
   * Get a simulation result of a proposal
   * @param proposalId
   */

  static async getSimulationResultOfProposal(proposalId: string) {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(proposal?.simulation?.url, ErrorKeyEnum.notFound, 404)
    return {
      url: proposal.simulation.url,
      status: ISimulationStatus.SUCCESS,
      runAt: proposal.simulation.runAt,
    }
  }

  static parseSimulationRequest(actions: Array<{ data: string; value: string; to: string }>) {
    actions = actions.map((action: any) => ({
      to: action.to,
      value: action.value || '0',
      data: action.data || '0x',
    }))

    const iFace = new Interface(DAO.abi)
    return iFace.encodeFunctionData('execute', [ethers.id(Date.now().toString()), actions, 0])
  }
}

export default SimulationController
