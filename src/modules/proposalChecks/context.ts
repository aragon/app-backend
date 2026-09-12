import { Models } from '@dbModels'
import KnownAbi, { type IInnerCall, TOKEN_CALL_NAMES } from '@modules/proposalChecks/abi'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import {
  type HexAddress,
  type IAssessmentContext,
  type IAssessmentFlatAction,
  type IAssessmentWrapper,
  type IPluginSummary,
  type IPreviousRevision,
  type IRawAction,
  type ISimulatedMovement,
  type ITokenStandard,
  type NetworksEnum,
} from '@types'
import { getAddress } from 'ethers'

/** Deeper than this and the inner calls are reported as cut off rather than followed. */
export const MAX_NESTED_DEPTH = 4

/**
 * Builds the input every check reads. It works from the captured revision alone: the proposal's
 * own action list, followed through the wrappers it knows (DAO execute, Safe transactions, the
 * Delay queue, Multicall3) into one flat tree with paths, decoded through the signatures the
 * checks know and then through the targets' verified source, and simulated at the evidence
 * block. Recipients are marked as not available here so a check can say what it could not verify.
 */
const AssessmentContextBuilder = {
  async _previous(request: ProposalAssessment): Promise<IPreviousRevision | null> {
    const earlier = await Models.ProposalAssessment.findOne(
      { proposalId: request.proposalId, generation: { $lt: request.generation } },
      { generation: 1, revisionId: 1, causeId: 1, captured: 1 },
      { sort: { generation: -1 } },
    )
    if (!earlier) return null
    return {
      generation: earlier.generation,
      revisionId: earlier.revisionId,
      causeId: earlier.causeId,
      captured: earlier.captured,
    }
  },

  /** The plugins installed at the block (installed before it, not uninstalled by it), and for each SPP the editable/cancelable flags of its stages as configured at the block. */
  async _plugins(daoAddress: HexAddress, network: NetworksEnum, block: number) {
    const rows = await Models.Plugin.find(
      {
        daoAddress,
        network,
        blockNumber: { $lte: block },
        $or: [{ 'uninstalled.status': { $ne: true } }, { 'uninstalled.blockNumber': { $gt: block } }],
      },
      { address: 1, interfaceType: 1, isSubPlugin: 1 },
    )
    const plugins: IPluginSummary[] = rows.map(p => ({
      address: p.address,
      interfaceType: p.interfaceType,
      isSubPlugin: !!p.isSubPlugin,
    }))
    const sppStages: Record<string, { editable: boolean; cancelable: boolean }> = {}
    for (const plugin of plugins) {
      if (plugin.interfaceType !== 'spp') continue
      const setting = await Models.Setting.findLastSettingByBlockNumber(plugin.address as HexAddress, block)
      const stages: Array<{ editable?: boolean; cancelable?: boolean }> = setting?.stages ?? []
      sppStages[plugin.address.toLowerCase()] = {
        editable: stages.some(s => !!s.editable),
        cancelable: stages.some(s => !!s.cancelable),
      }
    }
    return { plugins, sppStages }
  },

  /** What each token contract the actions touch is: from the simulation when it saw it move, else from the indexed token, else unknown. */
  async _tokenStandards(
    actions: readonly IAssessmentFlatAction[],
    movements: readonly ISimulatedMovement[],
    network: NetworksEnum,
  ): Promise<Record<string, ITokenStandard | null>> {
    const tokens: Record<string, ITokenStandard | null> = {}
    for (const action of actions) {
      if (action.decoded && TOKEN_CALL_NAMES.has(action.decoded.name)) tokens[action.target.toLowerCase()] = null
    }
    for (const movement of movements) {
      if (movement.standard && movement.asset.toLowerCase() in tokens)
        tokens[movement.asset.toLowerCase()] = movement.standard
    }
    for (const address of Object.keys(tokens)) {
      if (tokens[address]) continue
      const known = await Models.Token.findOne({ address: getAddress(address), network }, { type: 1 })
      const type = known?.type
      tokens[address] = type === 'ERC20' || type === 'ERC721' || type === 'ERC1155' ? type : null
    }
    return tokens
  },

  /** Who runs an inner call: the wrapper itself, the same account through a delegatecall, or unknown for a Delay queue and a Roles module, which execute through an avatar they alone know. */
  _innerCaller(outer: IInnerCall, outerCaller: HexAddress | null, wrapper: IAssessmentWrapper): HexAddress | null {
    if (wrapper === 'executeNextTx' || wrapper === 'callTargetFunctionWithRole') return null
    // A proxy upgrade's call runs inside the proxy by delegatecall, so the sender stays the one that called the proxy.
    if (outer.operation === 'delegatecall' || wrapper === 'upgradeToAndCall' || wrapper === 'upgradeAndCall')
      return outerCaller
    return outer.to as HexAddress
  },

  _flatten(rawActions: IRawAction[], caller: HexAddress): IAssessmentFlatAction[] {
    const out: IAssessmentFlatAction[] = []
    ;(rawActions ?? []).forEach((action, index) => {
      AssessmentContextBuilder._walk(
        {
          to: String(action.to ?? ''),
          value: String(action.value ?? '0'),
          data: String(action.data ?? '0x'),
          operation: 'call',
        },
        { path: String(index), depth: 0, caller, via: null },
        out,
      )
    })
    return out
  },

  _walk(
    call: IInnerCall,
    at: { path: string; depth: number; caller: HexAddress | null; via: IAssessmentWrapper | null },
    out: IAssessmentFlatAction[],
  ): void {
    const selector = KnownAbi.selectorOf(call.data)
    const decoded = selector ? KnownAbi.decode(call.data) : null
    const hasBytes = call.data.replace(/^0x/i, '').length > 0
    const inner = KnownAbi.isWrapperSelector(selector) ? KnownAbi.decodeWrapper(call.data, call.to) : null

    const flat: IAssessmentFlatAction = {
      path: at.path,
      depth: at.depth,
      caller: at.caller,
      target: call.to,
      value: call.value,
      data: call.data,
      selector,
      operation: call.operation,
      decoding: !hasBytes ? 'empty' : decoded ? 'known' : 'unknown',
      decoded,
      abi: decoded ? { source: 'builtin', contractName: null, implementation: null, blockPinned: true } : null,
      via: at.via,
      nested: !KnownAbi.isWrapperSelector(selector)
        ? null
        : !inner
          ? 'unreadable'
          : at.depth + 1 >= MAX_NESTED_DEPTH
            ? 'truncated'
            : 'expanded',
    }
    out.push(flat)

    if (flat.nested !== 'expanded' || !inner) return
    const innerCaller = AssessmentContextBuilder._innerCaller(call, at.caller, inner.wrapper)
    inner.calls.forEach((child, i) => {
      AssessmentContextBuilder._walk(
        child,
        { path: `${at.path}/${i}`, depth: at.depth + 1, caller: innerCaller, via: inner.wrapper },
        out,
      )
    })
  },
}

export default AssessmentContextBuilder
