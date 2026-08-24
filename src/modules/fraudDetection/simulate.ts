import { DAO } from '@artifacts/dao'
import logger from '@logger'
import TenderlyModule from '@modules/tenderly'
import {
  type IFraudApproval,
  type IFraudMovement,
  type IFraudRawAction,
  type IFraudSimCall,
  type IFraudSimulationFacts,
  type ITenderlyAssetChange,
  type ITenderlyCallTrace,
  type ITenderlyLog,
  ISimulationStatus,
  type NetworksEnum,
} from '@types'
import { Interface, id as keccakId, MaxUint256 } from 'ethers'
import { APPROVAL_TOPIC, MAX_TRACE_DEPTH } from './constants'

const llo = logger.logMeta.bind(null, { service: 'fraud-simulate' })

const daoInterface = new Interface(DAO.abi)

const empty = (status: IFraudSimulationFacts['status'], error: string | null = null): IFraudSimulationFacts => ({
  status,
  shareUrl: null,
  runAt: Date.now(),
  movements: [],
  approvals: [],
  calls: [],
  error,
})

/** Flattened so a call routed through a Safe module three levels down is still visible. */
const flattenCalls = (trace: ITenderlyCallTrace | undefined, depth = 0): IFraudSimCall[] => {
  if (!trace || depth > MAX_TRACE_DEPTH) return []
  const children = (trace.calls ?? []).flatMap(call => flattenCalls(call, depth + 1))
  // Trace nodes with no target, or the zero address, are internal steps rather than calls to
  // anything. Counting them makes every proposal look like it calls unknown contracts.
  if (!trace.to || /^0x0+$/.test(trace.to)) return children
  return [{ to: trace.to, functionName: trace.function_name ?? null, depth }, ...children]
}

/** Matches `raw.topics[0]`, not the decoded name — Tenderly only decodes ABIs it holds. */
const readApprovals = (logs: ITenderlyLog[]): IFraudApproval[] => {
  const approvals: IFraudApproval[] = []
  for (const log of logs) {
    const topics = log.raw?.topics ?? []
    if (topics[0]?.toLowerCase() !== APPROVAL_TOPIC || topics.length < 3) continue
    const owner = `0x${topics[1].slice(-40)}`
    const spender = `0x${topics[2].slice(-40)}`
    const raw = log.raw?.data ?? '0x'
    let amount = '0'
    try {
      amount = BigInt(raw === '0x' ? '0x0' : raw).toString()
    } catch {
      amount = '0'
    }
    approvals.push({
      token: log.raw?.address ?? log.address ?? '',
      owner,
      spender,
      amount,
      isUnlimited: amount === MaxUint256.toString(),
    })
  }
  return approvals
}

const readMovements = (changes: ITenderlyAssetChange[]): IFraudMovement[] =>
  changes.map(change => ({
    type: change.type,
    from: change.from ?? '',
    to: change.to ?? '',
    token: change.token_info?.contract_address ?? '',
    symbol: change.token_info?.symbol ?? null,
    amount: change.raw_amount ?? change.amount ?? '0',
    usd: change.dollar_value ? Number(change.dollar_value) : null,
  }))

/**
 * Runs the proposal as the plugin calling `dao.execute()`, no allowFailureMap, and reports what
 * happened. Forms no opinion: judging a movement needs the DAO's address set, so that lives in
 * `simulationSignals`. An unavailable Tenderly is `unconfirmed`, never clean.
 */
export const simulateExecution = async (params: {
  actions: IFraudRawAction[]
  daoAddress: string
  pluginAddress: string
  proposalId: string
  network: NetworksEnum
  blockNumber?: number | null
}): Promise<IFraudSimulationFacts> => {
  if (!TenderlyModule.isConfigured()) return empty('unconfirmed', 'tenderly not configured')

  try {
    const actions = params.actions.map(a => ({ to: a.to, value: a.value || '0', data: a.data || '0x' }))
    const data = daoInterface.encodeFunctionData('execute', [keccakId(params.proposalId), actions, 0])
    // Pinned to the proposal's own block. Against latest state a proposal created days ago
    // reverts on state that has since moved, which reads as safe when it is not.
    const result = await TenderlyModule.simulateFull(
      { to: params.daoAddress, from: params.pluginAddress, data, blockNumber: params.blockNumber },
      params.network,
    )
    if (!result) return empty('unconfirmed', 'no simulation result')

    const facts: IFraudSimulationFacts = {
      status: result.status === ISimulationStatus.SUCCESS ? 'confirmed' : 'reverted',
      shareUrl: result.shareUrl ?? null,
      runAt: Date.now(),
      movements: readMovements(result.assetChanges ?? []),
      approvals: readApprovals(result.logs ?? []),
      calls: flattenCalls(result.callTrace),
      error: result.error ?? null,
    }

    if (facts.status === 'confirmed' && !facts.movements.length && !facts.approvals.length) {
      facts.status = 'noEffect'
    }

    logger.info(
      'FraudScan simulation read',
      llo({
        proposalId: params.proposalId,
        status: facts.status,
        movements: facts.movements.length,
        approvals: facts.approvals.length,
        calls: facts.calls.length,
      }),
    )

    return facts
  } catch (error: any) {
    logger.warn('FraudScan simulation failed', llo({ proposalId: params.proposalId, error: error.message }))
    return empty('unconfirmed', error.message)
  }
}
