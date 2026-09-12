import logger from '@logger'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type IStageBodyEvidence, type IStageEvidence, type IVotingEvidence, type NetworksEnum } from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:votingEvidence' })

const tokenVoting = new Interface([
  'function getProposal(uint256 _proposalId) view returns (bool open, bool executed, (uint8 votingMode, uint32 supportThreshold, uint64 startDate, uint64 endDate, uint64 snapshotBlock, uint256 minVotingPower) parameters, (uint256 abstain, uint256 yes, uint256 no) tally, (address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap)',
  'function totalVotingPower(uint256 _blockNumber) view returns (uint256)',
])
const staged = new Interface([
  'function getProposal(uint256 _proposalId) view returns ((uint128 allowFailureMap, uint64 lastStageTransition, uint16 currentStage, uint16 stageConfigIndex, bool executed, bool canceled, address creator, (address to, uint256 value, bytes data)[] actions, (address target, uint8 operation) targetConfig))',
  'function getBodyProposalId(uint256 _proposalId, uint16 _stageId, address _body) view returns (uint256)',
  'function getBodyResult(uint256 _proposalId, uint16 _stageId, address _body) view returns (uint8)',
  'function getProposalTally(uint256 _proposalId, uint16 _stageId) view returns (uint256 approvals, uint256 vetoes)',
])

/** OSx vote options: none, abstain, yes, no. */
const ABSTAIN = 1
const YES = 2
const NO = 3
const RESULT_NAMES = ['none', 'approval', 'veto'] as const

/** The indexed proposal fields the two readers compare against; all optional since plugins index differently. */
/** What the readers need from the request: where the plugin is and which block to read at. */
export type IEvidenceRequest = Pick<ProposalAssessment, 'id' | 'network' | 'pluginAddress' | 'captured'>

export interface IIndexedProposal {
  startDate?: number
  endDate?: number
  settings?: {
    votingMode?: number
    supportThreshold?: number
    minParticipation?: number
    stages?: Array<{
      approvalThreshold?: number
      vetoThreshold?: number
      plugins?: Array<{ address: string; isManual?: boolean }>
    }>
  } | null
  snapshot?: { totalSupply?: string } | null
  metrics?: { votesByOption?: Array<{ type: number; totalVotingPower?: string }> } | null
  stageIndex?: number
  lastStageTransition?: number
  subProposals?: Array<{ pluginAddress: string; proposalIndex?: string; stageIndex?: number }>
  results?: Array<{ pluginAddress: string; resultType: number; stage: number }>
}

/**
 * Reads the vote as the plugin itself holds it at the evidence block, so the index can be checked
 * against the chain rather than trusted. A token vote is read whole, with the eligible supply at
 * its snapshot; a staged proposal is read with the child proposal and the reported result of
 * every body of its current stage. Other plugins are not read, and say so.
 */
const VotingEvidence = {
  async voting(
    request: IEvidenceRequest,
    proposal: IIndexedProposal | null,
    interfaceType: string | null,
    proposalIndex: string,
  ): Promise<IVotingEvidence> {
    const block = request.captured.evidenceBlock.number
    const indexed: IVotingEvidence['indexed'] = {
      votingMode: proposal?.settings?.votingMode ?? null,
      supportThreshold:
        proposal?.settings?.supportThreshold !== undefined ? String(proposal.settings.supportThreshold) : null,
      minParticipation:
        proposal?.settings?.minParticipation !== undefined ? String(proposal.settings.minParticipation) : null,
      startDate: proposal?.startDate ?? null,
      endDate: proposal?.endDate ?? null,
      totalSupply: proposal?.snapshot?.totalSupply ?? null,
      tally: proposal?.metrics?.votesByOption ? VotingEvidence._indexedTally(proposal.metrics.votesByOption) : null,
    }
    if (interfaceType !== 'tokenVoting') {
      return {
        status: 'unsupported',
        reason: `voting data is read for token voting only, not ${interfaceType ?? 'an unknown plugin'}`,
        block,
        chain: null,
        indexed,
      }
    }
    try {
      const read = VotingEvidence._reader(request.pluginAddress, tokenVoting, request.network, block)
      const p = await read('getProposal', [proposalIndex])
      const snapshotBlock = Number(p.parameters.snapshotBlock)
      let eligibleSupply: string | null = null
      try {
        eligibleSupply = String(await read('totalVotingPower', [snapshotBlock]))
      } catch (error) {
        logger.warn(
          'proposal checks: eligible supply at the snapshot could not be read',
          llo({ requestId: request.id, error }),
        )
      }
      return {
        status: 'ok',
        reason: null,
        block,
        chain: {
          open: Boolean(p.open),
          executed: Boolean(p.executed),
          votingMode: Number(p.parameters.votingMode),
          supportThreshold: String(p.parameters.supportThreshold),
          startDate: Number(p.parameters.startDate),
          endDate: Number(p.parameters.endDate),
          snapshotBlock,
          minVotingPower: String(p.parameters.minVotingPower),
          eligibleSupply,
          tally: { yes: String(p.tally.yes), no: String(p.tally.no), abstain: String(p.tally.abstain) },
        },
        indexed,
      }
    } catch (error) {
      logger.warn('proposal checks: token vote could not be read at the block', llo({ requestId: request.id, error }))
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message.slice(0, 200) : String(error),
        block,
        chain: null,
        indexed,
      }
    }
  },

  async stages(
    request: IEvidenceRequest,
    proposal: IIndexedProposal | null,
    interfaceType: string | null,
    proposalIndex: string,
  ): Promise<IStageEvidence> {
    const block = request.captured.evidenceBlock.number
    const indexed = {
      stageIndex: proposal?.stageIndex ?? null,
      lastStageTransition: proposal?.lastStageTransition ?? null,
    }
    if (interfaceType !== 'spp') {
      return {
        status: 'unsupported',
        reason: `stage results are read for staged processors only, not ${interfaceType ?? 'an unknown plugin'}`,
        block,
        chain: null,
        indexed,
        stage: null,
        bodies: [],
      }
    }
    try {
      const read = VotingEvidence._reader(request.pluginAddress, staged, request.network, block)
      const p = await read('getProposal', [proposalIndex])
      const currentStage = Number(p.currentStage)
      const tally = await read('getProposalTally', [proposalIndex, currentStage])
      const stored = proposal?.settings?.stages?.[currentStage] ?? null
      const bodies: IStageBodyEvidence[] = []
      for (const plugin of stored?.plugins ?? []) {
        const childId = String(await read('getBodyProposalId', [proposalIndex, currentStage, plugin.address]))
        const result = Number(await read('getBodyResult', [proposalIndex, currentStage, plugin.address]))
        const sub = proposal?.subProposals?.find(
          s =>
            s.pluginAddress.toLowerCase() === plugin.address.toLowerCase() &&
            (s.stageIndex ?? currentStage) === currentStage,
        )
        const reported = proposal?.results?.find(
          r => r.pluginAddress.toLowerCase() === plugin.address.toLowerCase() && r.stage === currentStage,
        )
        bodies.push({
          body: plugin.address,
          isManual: Boolean(plugin.isManual),
          chainChildId: childId === '0' ? null : childId,
          chainResult: RESULT_NAMES[result] ?? null,
          indexedChildIndex: sub?.proposalIndex ?? null,
          indexedResult: reported ? (RESULT_NAMES[reported.resultType] ?? null) : null,
        })
      }
      return {
        status: 'ok',
        reason: null,
        block,
        chain: {
          currentStage,
          lastStageTransition: Number(p.lastStageTransition),
          executed: Boolean(p.executed),
          canceled: Boolean(p.canceled),
          approvals: String(tally.approvals),
          vetoes: String(tally.vetoes),
        },
        indexed,
        stage: stored
          ? {
              approvalThreshold: String(stored.approvalThreshold ?? 0),
              vetoThreshold: String(stored.vetoThreshold ?? 0),
            }
          : null,
        bodies,
      }
    } catch (error) {
      logger.warn(
        'proposal checks: staged proposal could not be read at the block',
        llo({ requestId: request.id, error }),
      )
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message.slice(0, 200) : String(error),
        block,
        chain: null,
        indexed,
        stage: null,
        bodies: [],
      }
    }
  },

  _indexedTally(options: Array<{ type: number; totalVotingPower?: string }>): {
    yes: string
    no: string
    abstain: string
  } {
    const power = (type: number) => options.find(o => o.type === type)?.totalVotingPower ?? '0'
    return { yes: power(YES), no: power(NO), abstain: power(ABSTAIN) }
  },

  _reader(address: string, abi: Interface, network: NetworksEnum, block: number) {
    const contract = new Contract(address, abi, ProviderModule.getAnyRpcProvider(network))
    return (fn: string, args: unknown[]) =>
      BottleneckModule.getNodeLimiter(network).schedule(() => contract.getFunction(fn)(...args, { blockTag: block }))
  },
}

export default VotingEvidence
