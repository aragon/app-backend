import { DAO } from '@artifacts/dao'
import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import TenderlyModule from '@modules/tenderly'
import {
  ErrorKeyEnum,
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  ITenderlyOperation,
  type NetworksEnum,
} from '@types'
import { ethers, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'simulation-controller' })

class SimulationController {
  static async validateAction(pluginAddress: string, network: NetworksEnum) {
    const plugin = await Models.Plugin.findOne({
      address: pluginAddress,
      status: IPluginStatus.installed,
      network,
      isSupported: true,
      interfaceType: { $ne: IPluginInterfaceType.safe },
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
    const deadlineAt = TenderlyModule.deadlineAt(Date.now())
    const plugin = await SimulationController.validateAction(pluginAddress, network)
    const encodedData = SimulationController.parseSimulationRequest(actions)

    const simulationAction = {
      to: plugin.daoAddress,
      data: encodedData,
      value: '0',
      from: pluginAddress,
    }

    const result = await TenderlyModule.simulate(simulationAction, network, {
      operation: ITenderlyOperation.pluginActions,
      network,
      daoAddress: plugin.daoAddress,
      deadlineAt,
    })

    return {
      status: result.status,
      url: result.url,
      runAt: result.runAt,
      network,
    }
  }

  /**
   * Run a simulation for a direct-execute action where the caller is the
   * connected wallet (EOA) rather than a plugin. Validates the target DAO is
   * indexed, but allows any `from` address.
   * @param daoAddress
   * @param from
   * @param actions
   * @param network
   */
  static async simulateDirectExecute(
    daoAddress: string,
    from: string,
    actions: Array<{ data: string; value: string; to: string }>,
    network: NetworksEnum,
  ): Promise<any> {
    const deadlineAt = TenderlyModule.deadlineAt(Date.now())
    const dao = await Models.Dao.findByAddress(daoAddress as HexAddress, network)
    Errors.assertExposable(
      dao,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Invalid DAO: must be an indexed DAO',
      llo({ daoAddress, network }),
    )

    const encodedData = SimulationController.parseSimulationRequest(actions)

    const simulationAction = {
      to: dao.address,
      data: encodedData,
      value: '0',
      from,
    }

    const result = await TenderlyModule.simulate(simulationAction, network, {
      operation: ITenderlyOperation.directExecute,
      network,
      daoAddress: dao.address,
      deadlineAt,
    })

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
    const deadlineAt = TenderlyModule.deadlineAt(Date.now())
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

    const result = await TenderlyModule.simulate(simulationAction, proposal.network, {
      operation: ITenderlyOperation.proposal,
      network: proposal.network,
      daoAddress: proposal.daoAddress,
      deadlineAt,
    })

    await DbOperations.updateDocument(
      proposal,
      {
        simulation: {
          status: result.status,
          url: result.url,
          runAt: new Date(result.runAt),
        },
      },
      { proposalId, network: proposal.network },
      'simulation-update',
      llo,
    )

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
      status: proposal.simulation.status,
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
