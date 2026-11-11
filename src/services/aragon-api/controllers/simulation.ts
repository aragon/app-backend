import SimulationQueue from '@api/controllers/simulationQueue'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import TenderlyProposal from '@modules/tenderly/proposal'
import {
  ErrorKeyEnum,
  type ISimulationResult,
  type ITenderlyAction,
  ITenderlyOperation,
  type NetworksEnum,
} from '@types'

class SimulationController {
  static async simulate(pluginAddress: string, actions: ITenderlyAction[], network: NetworksEnum) {
    return SimulationQueue.request({
      operation: ITenderlyOperation.pluginActions,
      pluginAddress,
      actions,
      network,
      sentAt: Date.now(),
    })
  }

  static async simulateDirectExecute(
    daoAddress: string,
    from: string,
    actions: ITenderlyAction[],
    network: NetworksEnum,
  ) {
    return SimulationQueue.request({
      operation: ITenderlyOperation.directExecute,
      daoAddress,
      from,
      actions,
      network,
      sentAt: Date.now(),
    })
  }

  static async simulateProposal(proposalId: string) {
    return SimulationQueue.request({ operation: ITenderlyOperation.proposal, proposalId, sentAt: Date.now() })
  }

  static async getSimulationResultOfProposal(
    proposalId: string,
  ): Promise<Omit<ISimulationResult, 'network'> & { matchesCurrentActions?: boolean }> {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(
      proposal?.simulation?.status && proposal.simulation.runAt && proposal.simulation.url,
      ErrorKeyEnum.notFound,
      404,
    )
    const simulation = proposal.simulation
    const matchesCurrentActions = TenderlyProposal.matchesCurrentActions(proposal)
    return {
      url: simulation.url,
      status: simulation.status,
      runAt: simulation.runAt,
      ...(matchesCurrentActions != null && { matchesCurrentActions }),
    }
  }
}

export default SimulationController
