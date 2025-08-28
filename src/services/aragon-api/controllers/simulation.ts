import { Models } from '@dbModels'
import TenderlyModule from '@modules/tenderly'
import logger from '@logger'
import { type NetworksEnum, IPluginStatus, ErrorKeyEnum, SimulationStatus } from '@types'
import * as Errors from '@errors'
import { Interface, ethers } from 'ethers'
import { DAO } from '@artifacts/dao'

const llo = logger.logMeta.bind(null, { service: 'simulation-controller' })

class SimulationController {
  /**
   * Validate action that recipient is a DAO and sender is a plugin
   */
  static async validateAction(
    action: { to: string; data: string; value?: string; from: string },
    network: NetworksEnum,
  ) {
    const dao = await Models.Dao.findOne({
      address: action.to,
      isActive: true,
      network,
      isHidden: { $ne: true },
    }).lean()

    Errors.assertExposable(
      dao,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Invalid recipient: must be a valid DAO',
      llo({
        action,
      }),
    )

    const plugin = await Models.Plugin.findOne({
      address: action.from,
      status: IPluginStatus.installed,
      daoAddress: dao.address,
      network: dao.network,
      isSupported: true,
    }).lean()

    Errors.assertExposable(
      plugin,
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Invalid sender: must be a valid plugin',
      llo({
        action,
      }),
    )
  }

  static async simulate(
    action: { to: string; data: string; value?: string; from: string },
    network: NetworksEnum,
  ): Promise<any> {
    await SimulationController.validateAction(action, network)

    const result = (await TenderlyModule.simulate(action, network)) as {
      url?: string
      runAt?: number
    }

    if (!result) {
      return {
        status: SimulationStatus.FAILED,
        runAt: new Date().toISOString(),
        network,
      }
    }

    return {
      status: SimulationStatus.SUCCESS,
      url: result.url,
      runAt: result.runAt,
      network,
    }
  }

  /**
   * Run a simulation for a proposal's actions by encoding them into DAO execute call
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

    const actions = proposal.rawActions.map((action: any) => ({
      to: action.to,
      value: action.value || '0',
      data: action.data || '0x',
    }))

    const iFace = new Interface(DAO.abi)
    const encodedData = iFace.encodeFunctionData('execute', [ethers.id(Date.now().toString()), actions, 0])

    const simulationAction = {
      to: proposal.daoAddress,
      data: encodedData,
      value: '0',
      from: proposal.pluginAddress,
    }

    const result = (await TenderlyModule.simulate(simulationAction, proposal.network)) as {
      url?: string
      runAt?: number
    }

    if (!result) {
      return {
        status: SimulationStatus.FAILED,
        runAt: new Date().toISOString(),
        network: proposal.network,
      }
    }

    await proposal.update({
      simulation: {
        status: result.url ? SimulationStatus.SUCCESS : SimulationStatus.FAILED,
        url: result.url,
        runAt: result.runAt ? new Date(result.runAt) : new Date(),
      },
    })

    return {
      status: SimulationStatus.SUCCESS,
      url: result.url,
      runAt: result.runAt,
      network: proposal.network,
    }
  }

  async getSimulationResultOfProposal(proposalId: string) {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(proposal?.simulation?.url, ErrorKeyEnum.notFound, 404)
    return {
      url: proposal.simulation.url,
      status: SimulationStatus.SUCCESS,
    }
  }
}

export default SimulationController
