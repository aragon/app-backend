/**
 * Fact pack builder for the proposal analysis.
 *
 * Everything the model is allowed to reason about is computed here, from indexed data, by code:
 * what each action calls, on which contract, with which parameters, how much money moves and what
 * share of the treasury that is. The model receives this pack as trusted structured facts and the
 * proposal text separately as untrusted data, and refers back to actions by `index`.
 *
 * This module is pure. It takes the proposal document plus the lookups the caller already made
 * (DAO, installed plugins, tokens, holdings) and returns a JSON-safe object, so it is unit tested
 * without Mongo and can be reused unchanged by the queue consumer later.
 */

import {
  type IProposalAnalysisAction,
  type IProposalAnalysisFactPack,
  type IProposalAnalysisParameter,
  type IProposalAnalysisStage,
  IProposalAnalysisTargetKind,
  type IProposalAnalysisTransfer,
  type ISimulationStatus,
  KnownActionSignature,
  type NetworksEnum,
  PROPOSAL_ANALYSIS_CONTRACT_VERSION,
  ProposalActionType,
} from '@types'
import { formatUnits, ZeroAddress } from 'ethers'
import KnownSignatures from './signatures'

/** Longest string kept for names, notices and symbols. They come from ABIs and explorers, not from us. */
const MAX_TEXT_LENGTH = 160
/** Longest stringified parameter value. Long `bytes` blobs add nothing the model can use. */
const MAX_PARAM_VALUE_LENGTH = 512
/** Decoder placeholder for a native transfer whose recipient has no contract name. */
const WALLET_PLACEHOLDER = 'Wallet Address'
const SHARE_PRECISION = 10_000n

export interface IFactPackTokenInfo {
  address: string
  symbol: string | null
  decimals: number | null
  priceUsd: string | null
}

export interface IFactPackAssetInfo {
  tokenAddress: string
  /** Smallest unit. */
  amount: string
}

/** The slice of a `Proposal` document the builder reads. Kept structural so tests need no model. */
export interface IFactPackProposal {
  id: string
  network: NetworksEnum
  daoAddress: string
  pluginAddress: string
  pluginSubdomain?: string | null
  creatorAddress: string
  startDate: number
  endDate: number
  isSubProposal?: boolean
  executed?: { status?: boolean } | null
  title?: string | null
  summary?: string | null
  description?: string | null
  rawActions?: Array<{ to: string; value: string | null; data: string | null }> | null
  actions?: any[] | null
  decoding?: boolean
  settings?: any
  simulation?: { status?: ISimulationStatus | null; runAt?: number | Date | null } | null
}

export interface IFactPackInput {
  proposal: IFactPackProposal
  dao: { name?: string | null; metrics?: { tvlUSD?: number | null } | null } | null
  /** Addresses of the plugins installed in the DAO. */
  pluginAddresses: string[]
  tokens: IFactPackTokenInfo[]
  assets: IFactPackAssetInfo[]
}

interface IBuildContext {
  daoAddress: string
  pluginAddresses: Set<string>
  tokens: Map<string, IFactPackTokenInfo>
  assets: Map<string, bigint>
  tvlUsd: number | null
}

const TRANSFER_SIGNATURES: string[] = [
  KnownActionSignature.Transfer,
  KnownActionSignature.TransferFrom,
  KnownActionSignature.SafeTransferFrom,
]

function lower(address: string | null | undefined): string {
  return (address ?? '').toLowerCase()
}

function cut(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      return BigInt(value.trim())
    } catch {
      return 0n
    }
  }
  return 0n
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  } catch {
    return String(value)
  }
}

/** `numerator / denominator` rounded to four decimals. Null when the denominator is zero. */
function ratio(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) {
    return null
  }
  return Number((numerator * SHARE_PRECISION) / denominator) / Number(SHARE_PRECISION)
}

function round(value: number): number {
  return Math.round(value * Number(SHARE_PRECISION)) / Number(SHARE_PRECISION)
}

function buildParameters(inputData: any): IProposalAnalysisParameter[] {
  const parameters = Array.isArray(inputData?.parameters) ? inputData.parameters : []
  return parameters.map((parameter: any) => ({
    name: cut(parameter?.name, MAX_TEXT_LENGTH),
    type: String(parameter?.type ?? 'unknown'),
    value: cut(stringifyValue(parameter?.value), MAX_PARAM_VALUE_LENGTH) ?? '',
  }))
}

function resolveTargetKind(
  to: string,
  hasCalldata: boolean,
  targetName: string | null,
  ctx: IBuildContext,
): IProposalAnalysisTargetKind {
  const target = lower(to)
  if (target === lower(ctx.daoAddress)) {
    return IProposalAnalysisTargetKind.dao
  }
  if (ctx.pluginAddresses.has(target)) {
    return IProposalAnalysisTargetKind.plugin
  }
  if (targetName && targetName !== WALLET_PLACEHOLDER) {
    return IProposalAnalysisTargetKind.contract
  }
  return hasCalldata ? IProposalAnalysisTargetKind.unknown : IProposalAnalysisTargetKind.wallet
}

function priceTransfer(
  tokenAddress: string,
  recipient: string,
  amountRaw: bigint,
  actionToken: any,
  ctx: IBuildContext,
): IProposalAnalysisTransfer {
  const known = ctx.tokens.get(lower(tokenAddress))
  const decimals = toNumberOrNull(actionToken?.decimals) ?? known?.decimals ?? null
  const symbol = cut(actionToken?.symbol ?? known?.symbol, MAX_TEXT_LENGTH)
  const priceUsd = toNumberOrNull(actionToken?.priceUsd ?? known?.priceUsd)

  const amount = decimals === null ? null : formatUnits(amountRaw, decimals)
  const amountUsd = amount !== null && priceUsd !== null && priceUsd > 0 ? round(Number(amount) * priceUsd) : null

  const shareOfTreasury =
    amountUsd !== null && ctx.tvlUsd !== null && ctx.tvlUsd > 0 ? round(amountUsd / ctx.tvlUsd) : null

  const balance = ctx.assets.get(lower(tokenAddress))
  const shareOfAssetBalance =
    balance === undefined ? null : (ratio(amountRaw > balance ? balance : amountRaw, balance) ?? null)

  return {
    tokenAddress,
    symbol,
    decimals,
    recipient,
    amountRaw: amountRaw.toString(),
    amount,
    amountUsd,
    shareOfTreasury,
    shareOfAssetBalance,
  }
}

/**
 * Money leaving the treasury through this action, if any. Native value on any call counts, and so
 * do the ERC20 transfer signatures whether or not the decoder typed them as `Transfer`.
 */
function extractTransfer(
  action: any,
  to: string,
  value: bigint,
  signature: string | null,
  ctx: IBuildContext,
): IProposalAnalysisTransfer | null {
  if (value > 0n) {
    return priceTransfer(ZeroAddress, to, value, action?.token, ctx)
  }

  const isErc20Transfer =
    action?.type === ProposalActionType.Transfer || (signature !== null && TRANSFER_SIGNATURES.includes(signature))
  if (!isErc20Transfer) {
    return null
  }

  const parameters = Array.isArray(action?.inputData?.parameters) ? action.inputData.parameters : []
  const isTransferFrom = signature !== KnownActionSignature.Transfer && parameters.length >= 3
  const recipient = action?.receiver?.address ?? parameters[isTransferFrom ? 1 : 0]?.value ?? null
  const amountRaw = toBigInt(action?.amount ?? parameters[isTransferFrom ? 2 : 1]?.value)

  if (!recipient) {
    return null
  }

  return priceTransfer(action?.token?.address ?? to, String(recipient), amountRaw, action?.token, ctx)
}

function buildAction(
  action: any,
  raw: { to: string; value: unknown; data: string | null } | null,
  index: number,
  parentIndex: number | null,
  depth: number,
  ctx: IBuildContext,
): IProposalAnalysisAction {
  const to = String(action?.to ?? raw?.to ?? '')
  const data: string = String(action?.data ?? raw?.data ?? '0x')
  const value = toBigInt(action?.value ?? raw?.value)
  const inputData = action?.inputData ?? null
  const hasCalldata = data.length >= 10

  const selector = KnownSignatures.selectorOf(data)
  const known = KnownSignatures.lookup(selector)
  const signature = cut(inputData?.textSignature ?? known?.signature, MAX_TEXT_LENGTH)
  const functionName = cut(inputData?.function ?? known?.name, MAX_TEXT_LENGTH)
  const targetName = cut(inputData?.contract ?? inputData?.proxyName, MAX_TEXT_LENGTH)

  return {
    index,
    parentIndex,
    depth,
    type: String(action?.type ?? ProposalActionType.Unknown),
    to,
    targetKind: resolveTargetKind(to, hasCalldata, targetName, ctx),
    targetName,
    value: value.toString(),
    selector,
    signature,
    functionName,
    notice: cut(inputData?.notice, MAX_TEXT_LENGTH),
    parameters: buildParameters(inputData),
    // A bare value transfer has nothing to decode.
    decoded: hasCalldata ? inputData !== null : true,
    transfer: extractTransfer(action, to, value, signature, ctx),
    destinationChainId: toNumberOrNull(inputData?.destinationChainId),
  }
}

function isDecodedAction(candidate: unknown): boolean {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate) && 'to' in candidate
}

/** Depth-first flattening. Children of `execute`/`createProposal`/`forwardMessage` follow their parent. */
function flattenActions(
  actions: any[],
  rawActions: Array<{ to: string; value: unknown; data: string | null }> | null,
  parentIndex: number | null,
  depth: number,
  out: IProposalAnalysisAction[],
  ctx: IBuildContext,
) {
  actions.forEach((candidate, position) => {
    const raw = rawActions?.[position] ?? null
    // `parseActions` stores `[]` for an action the decoder threw on; the raw action still exists.
    const action = isDecodedAction(candidate) ? candidate : null
    if (!action && !raw) {
      return
    }

    const index = out.length
    out.push(buildAction(action, raw, index, parentIndex, depth, ctx))

    const children = action?.inputData?.actions
    if (Array.isArray(children) && children.length > 0) {
      flattenActions(children, null, index, depth + 1, out, ctx)
    }
  })
}

function buildStages(settings: any): IProposalAnalysisStage[] {
  const stages = Array.isArray(settings?.stages) ? settings.stages : []
  return stages.map((stage: any, position: number) => ({
    stageIndex: toNumberOrNull(stage?.stageIndex) ?? position,
    name: cut(stage?.name, MAX_TEXT_LENGTH),
    approvalThreshold: toNumberOrNull(stage?.approvalThreshold),
    vetoThreshold: toNumberOrNull(stage?.vetoThreshold),
    voteDuration: toNumberOrNull(stage?.voteDuration),
  }))
}

function toMillis(value: number | Date | null | undefined): number | null {
  if (value instanceof Date) {
    return value.getTime()
  }
  return toNumberOrNull(value)
}

const ProposalAnalysisFactPack = {
  build(input: IFactPackInput): IProposalAnalysisFactPack {
    const { proposal, dao } = input
    const tvlUsd = toNumberOrNull(dao?.metrics?.tvlUSD)

    const ctx: IBuildContext = {
      daoAddress: proposal.daoAddress,
      pluginAddresses: new Set(input.pluginAddresses.map(lower)),
      tokens: new Map(input.tokens.map(token => [lower(token.address), token])),
      assets: new Map(input.assets.map(asset => [lower(asset.tokenAddress), toBigInt(asset.amount)])),
      tvlUsd,
    }

    const rawActions = Array.isArray(proposal.rawActions) ? proposal.rawActions : []
    const decodedActions = Array.isArray(proposal.actions) ? proposal.actions : []
    // Walk the raw list when it is longer: a raw action the decoder never reached is still an action.
    const topLevel = decodedActions.length >= rawActions.length ? decodedActions : rawActions.map(() => null)

    const actions: IProposalAnalysisAction[] = []
    flattenActions(topLevel, rawActions, null, 0, actions, ctx)

    const pricedTransfers = actions.filter(action => action.transfer?.amountUsd !== null && action.transfer !== null)
    const outflowUsd =
      pricedTransfers.length === 0
        ? null
        : round(pricedTransfers.reduce((sum, action) => sum + (action.transfer?.amountUsd ?? 0), 0))
    const outflowShare = outflowUsd !== null && tvlUsd !== null && tvlUsd > 0 ? round(outflowUsd / tvlUsd) : null

    const settings = proposal.settings ?? {}

    return {
      contractVersion: PROPOSAL_ANALYSIS_CONTRACT_VERSION,
      proposal: {
        id: proposal.id,
        network: proposal.network,
        daoAddress: proposal.daoAddress,
        daoName: cut(dao?.name, MAX_TEXT_LENGTH),
        pluginAddress: proposal.pluginAddress,
        pluginSubdomain: cut(proposal.pluginSubdomain, MAX_TEXT_LENGTH),
        creatorAddress: proposal.creatorAddress,
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        isSubProposal: proposal.isSubProposal === true,
        executed: proposal.executed?.status === true,
        hasTitle: !!proposal.title?.trim(),
        hasSummary: !!proposal.summary?.trim(),
        hasDescription: !!proposal.description?.trim(),
      },
      governance: {
        votingMode: toNumberOrNull(settings.votingMode),
        supportThreshold: toNumberOrNull(settings.supportThreshold),
        minParticipation: toNumberOrNull(settings.minParticipation),
        minDuration: toNumberOrNull(settings.minDuration),
        minApprovals: toNumberOrNull(settings.minApprovals),
        onlyListed: typeof settings.onlyListed === 'boolean' ? settings.onlyListed : null,
        stages: buildStages(settings),
      },
      treasury: { tvlUsd, outflowUsd, outflowShare },
      actions,
      simulation: {
        status: proposal.simulation?.status ?? null,
        runAt: toMillis(proposal.simulation?.runAt),
      },
      integrity: {
        decoding: proposal.decoding === true,
        rawActionsCount: rawActions.length,
        topLevelActionsCount: actions.filter(action => action.depth === 0).length,
        undecodedActionsCount: actions.filter(action => !action.decoded).length,
        actionsCountMismatch: decodedActions.length !== rawActions.length,
      },
    }
  },
}

export default ProposalAnalysisFactPack
