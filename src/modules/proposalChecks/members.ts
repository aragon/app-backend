import { Models } from '@dbModels'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  type IAssessmentEvidenceBlock,
  type IAssessmentFlatAction,
  type IMembershipFacts,
  type NetworksEnum,
} from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:members' })

const readers = new Interface([
  'function addresslistLengthAtBlock(uint256 _blockNumber) view returns (uint256)',
  'function isListedAtBlock(address _account, uint256 _blockNumber) view returns (bool)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
])

/** How many proposals still open on a plugin are named when a member is removed. */
const OPEN_PROPOSALS_LISTED = 5

export interface IMembershipCall {
  kind: 'add' | 'remove' | 'swap' | 'threshold'
  /** Members added, removed or (for a swap) replaced, in order. */
  members: string[]
  /** A swap's incoming member. */
  newMember: string | null
  /** The threshold the call sets alongside, when it does. */
  threshold: string | null
  /** True for the Safe's owner functions, false for the OSx address list. */
  safe: boolean
  /** A settings update only moves the threshold; it is folded but reported by the settings rule. */
  settingsOnly: boolean
}

/**
 * Reads who could approve on a multisig or a Safe at the evidence block. The OSx address list
 * keeps its own history, so the count and each touched address are read at the block; a Safe
 * has no history, so its owners and threshold are read at the block through the provider. The
 * proposals still open on a plugin are listed, since a member removed today can still approve
 * every proposal that was already open.
 */
const MembershipFacts = {
  callOf(action: IAssessmentFlatAction): IMembershipCall | null {
    if (action.operation === 'delegatecall') return null
    const parsed = KnownAbi.parse(action.data)
    if (!parsed) return null
    const a = parsed.args
    switch (parsed.name) {
      case 'addAddresses':
        return {
          kind: 'add',
          members: [...a._members],
          newMember: null,
          threshold: null,
          safe: false,
          settingsOnly: false,
        }
      case 'removeAddresses':
        return {
          kind: 'remove',
          members: [...a._members],
          newMember: null,
          threshold: null,
          safe: false,
          settingsOnly: false,
        }
      case 'addOwnerWithThreshold':
        return {
          kind: 'add',
          members: [a.owner],
          newMember: null,
          threshold: a._threshold.toString(),
          safe: true,
          settingsOnly: false,
        }
      case 'removeOwner':
        return {
          kind: 'remove',
          members: [a.owner],
          newMember: null,
          threshold: a._threshold.toString(),
          safe: true,
          settingsOnly: false,
        }
      case 'swapOwner':
        return {
          kind: 'swap',
          members: [a.oldOwner],
          newMember: a.newOwner,
          threshold: null,
          safe: true,
          settingsOnly: false,
        }
      case 'changeThreshold':
        return {
          kind: 'threshold',
          members: [],
          newMember: null,
          threshold: a._threshold.toString(),
          safe: true,
          settingsOnly: false,
        }
      case 'updateMultisigSettings':
        return {
          kind: 'threshold',
          members: [],
          newMember: null,
          threshold: a._multisigSettings.minApprovals.toString(),
          safe: false,
          settingsOnly: true,
        }
      default:
        return null
    }
  },

  async load(
    actions: readonly IAssessmentFlatAction[],
    network: NetworksEnum,
    block: IAssessmentEvidenceBlock,
  ): Promise<Record<string, IMembershipFacts>> {
    const byTarget = new Map<string, { target: string; calls: IMembershipCall[] }>()
    for (const action of actions) {
      const call = MembershipFacts.callOf(action)
      if (!call || call.settingsOnly) continue
      const key = action.target.toLowerCase()
      if (!byTarget.has(key)) byTarget.set(key, { target: action.target, calls: [] })
      byTarget.get(key)!.calls.push(call)
    }
    const facts: Record<string, IMembershipFacts> = {}
    for (const [key, { target, calls }] of byTarget) {
      try {
        facts[key] = calls[0].safe
          ? await MembershipFacts._safe(target, calls, network, block.number)
          : await MembershipFacts._addresslist(target, calls, network, block)
      } catch (error) {
        logger.warn('proposal checks: membership at the block could not be read', llo({ target, network, error }))
      }
    }
    return facts
  },

  async _addresslist(
    target: string,
    calls: IMembershipCall[],
    network: NetworksEnum,
    block: IAssessmentEvidenceBlock,
  ): Promise<IMembershipFacts> {
    const read = MembershipFacts._reader(target, network, block.number)
    const count = Number(await read('addresslistLengthAtBlock', [block.number]))
    const listed: Record<string, boolean> = {}
    for (const member of new Set(calls.flatMap(c => c.members).map(m => m.toLowerCase()))) {
      listed[member] = Boolean(await read('isListedAtBlock', [member, block.number]))
    }
    const setting = await Models.Setting.findLastSettingByBlockNumber(target as HexAddress, block.number)
    const open = await Models.Proposal.find(
      { pluginAddress: target, network, endDate: { $gt: block.time }, 'executed.status': { $ne: true } },
      { id: 1 },
      { limit: OPEN_PROPOSALS_LISTED + 1, sort: { endDate: 1 } },
    )
    return {
      kind: 'multisig',
      count,
      threshold: setting?.minApprovals ?? null,
      listed,
      openProposals: open.map(p => p.id),
    }
  },

  async _safe(
    target: string,
    calls: IMembershipCall[],
    network: NetworksEnum,
    block: number,
  ): Promise<IMembershipFacts> {
    const read = MembershipFacts._reader(target, network, block)
    const owners: string[] = [...(await read('getOwners', []))].map(String)
    const listed: Record<string, boolean> = {}
    for (const member of calls.flatMap(c => c.members)) {
      listed[member.toLowerCase()] = owners.some(o => o.toLowerCase() === member.toLowerCase())
    }
    return {
      kind: 'safe',
      count: owners.length,
      threshold: Number(await read('getThreshold', [])),
      listed,
      openProposals: [],
    }
  },

  _reader(target: string, network: NetworksEnum, block: number) {
    const contract = new Contract(target, readers, ProviderModule.getAnyRpcProvider(network))
    return (fn: string, args: unknown[]) =>
      BottleneckModule.getNodeLimiter(network).schedule(() => contract.getFunction(fn)(...args, { blockTag: block }))
  },
}

export default MembershipFacts
