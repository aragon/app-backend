import SimulationQueue from '@api/controllers/simulationQueue'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import TenderlyProposal from '@modules/tenderly/proposal'
import {
  ErrorKeyEnum,
  type HexAddress,
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

  /** Only a Safe some DAO tracks, or an admin registered, has stored transactions to simulate. */
  static async simulateSafeTransaction(network: NetworksEnum, safeAddress: HexAddress, safeTxHash: string) {
    await SafeBodyMembersModule.assertTracked(safeAddress, network)
    return SimulationQueue.request({
      operation: ITenderlyOperation.safeTransaction,
      network,
      safeAddress,
      safeTxHash,
      sentAt: Date.now(),
    })
  }

  static async getSimulationResultOfSafeTransaction(
    network: NetworksEnum,
    safeAddress: HexAddress,
    safeTxHash: string,
  ): Promise<Omit<ISimulationResult, 'network'>> {
    await SafeBodyMembersModule.assertTracked(safeAddress, network)
    const transaction = await Models.SafeTransaction.findOne({ network, safeAddress, safeTxHash })
      .select('simulation')
      .lean()
    const simulation = transaction?.simulation
    Errors.assertExposable(simulation?.status && simulation.runAt && simulation.url, ErrorKeyEnum.notFound, 404)
    return { url: simulation!.url!, status: simulation!.status!, runAt: simulation!.runAt! }
  }
}

export default SimulationController
