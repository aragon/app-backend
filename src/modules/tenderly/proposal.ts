import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import type Proposal from '@models/schema/proposal'
import DbTx from '@modules/dbTx'
import { ErrorKeyEnum, type ISimulationResult, type ITenderlyActionInput, ITenderlyOperation } from '@types'
import TenderlyCache from './cache'

type ProposalInput = Pick<Proposal, 'id' | 'network' | 'daoAddress' | 'pluginAddress' | 'rawActions'>

const TenderlyProposal = {
  async load(proposalId: string): Promise<Proposal> {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(proposal?.rawActions?.length, ErrorKeyEnum.notFound, 404, 'Proposal not found')
    return proposal
  },

  input(proposal: ProposalInput): ITenderlyActionInput {
    return {
      proposalId: proposal.id,
      network: proposal.network,
      daoAddress: proposal.daoAddress,
      from: proposal.pluginAddress,
      actions: proposal.rawActions,
    }
  },

  inputHash(proposal: ProposalInput): string {
    return TenderlyCache.key(ITenderlyOperation.proposal, TenderlyProposal.input(proposal))
  },

  matchesCurrentActions(proposal: ProposalInput & Pick<Proposal, 'simulation'>): boolean {
    return !!proposal.simulation?.inputHash && proposal.simulation.inputHash === TenderlyProposal.inputHash(proposal)
  },

  recent(proposal: Proposal, inputHash: string): ISimulationResult | null {
    const simulation = proposal.simulation
    if (
      simulation?.inputHash !== inputHash ||
      !simulation.status ||
      !simulation.runAt ||
      simulation.runAt + config.TENDERLY.RE_SIMULATION_TIME <= Date.now()
    )
      return null
    return {
      status: simulation.status,
      url: simulation.url ?? undefined,
      runAt: simulation.runAt,
      network: proposal.network,
    }
  },

  async save(proposalId: string, inputHash: string, result: ISimulationResult): Promise<void> {
    try {
      await DbTx.executeTxFn(
        async ({ session }) => {
          let current: Proposal | null
          try {
            current = await Models.Proposal.findByEntityId(proposalId, { session })
          } catch {
            Errors.throwExposable(ErrorKeyEnum.tooBusy)
          }
          Errors.assertExposable(
            !!current?.rawActions?.length && TenderlyProposal.inputHash(current!) === inputHash,
            ErrorKeyEnum.tooBusy,
          )
          await Models.Proposal.updateOne(
            { id: proposalId },
            { $set: { simulation: { ...result, inputHash } } },
            { session },
          )
          await session.commitTransaction()
        },
        { stopRetry: true, throwOnStop: true },
      )
    } catch (error) {
      if (Errors.isExposableError(error)) throw error
      if (DbTx.isErrorConflict(error)) Errors.throwExposable(ErrorKeyEnum.tooBusy)
    }
  },
}

export default TenderlyProposal
