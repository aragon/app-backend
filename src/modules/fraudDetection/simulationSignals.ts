import type { IFraudRiskContext, IFraudSignal, IFraudSimulationFacts } from '@types'
import { GOVERNANCE_FN_NAMES } from './constants'

const short = (a?: string | null): string => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : '-')

const lower = (a?: string | null): string => (a ?? '').toLowerCase()

/**
 * No signal here may depend on recognising a selector or function name — that is what let the
 * Term drains through. Scoring is on where value went and who was called. `GOVERNANCE_FN_NAMES`
 * only labels a call; an unnamed one still scores via `opaqueExternalCall`.
 */
/** Names produced here, so a re-score can reuse them instead of paying for a second run. */
export const SIMULATION_SIGNAL_NAMES = new Set([
  'outsiderOutflow',
  'outsiderApproval',
  'unlimitedApproval',
  'controlHandover',
  'opaqueExternalCall',
  'simulationReverted',
])

export const simulationSignals = (facts: IFraudSimulationFacts, context: IFraudRiskContext): IFraudSignal[] => {
  const signals: IFraudSignal[] = []

  // Same insider rule as the static scorer.
  const insiders = new Set<string>()
  for (const address of context.systemAddresses ?? []) insiders.add(lower(address))
  for (const holder of context.tokenHolders ?? []) insiders.add(lower(holder))
  insiders.add(lower(context.daoAddress))
  insiders.add(lower(context.pluginAddress))

  const isOutsider = (address?: string | null): boolean => !!address && !insiders.has(lower(address))

  // Nothing to read. The finding still records `simulation.status`, which the alert prints,
  // so a skipped run never reads as an all-clear.
  if (facts.status === 'unconfirmed') return signals

  // Net, not per-transfer. A drain unwinds through vaults and routers that each receive and
  // forward the same value, and the sender of the final hop is rarely the DAO itself. Only an
  // address left holding value at the end of the simulation actually gained anything.
  const net = new Map<string, { address: string; token: string; symbol: string | null; amount: bigint; usd: number }>()
  for (const move of facts.movements) {
    let amount: bigint
    try {
      amount = BigInt(move.amount)
    } catch {
      continue
    }
    for (const [party, sign] of [
      [move.to, 1n],
      [move.from, -1n],
    ] as const) {
      if (!party) continue
      const key = `${lower(party)}:${lower(move.token)}`
      const entry = net.get(key) ?? { address: party, token: move.token, symbol: move.symbol, amount: 0n, usd: 0 }
      entry.amount += sign * amount
      entry.usd += Number(sign) * (move.usd ?? 0)
      net.set(key, entry)
    }
  }

  const gains = [...net.values()].filter(entry => entry.amount > 0n && isOutsider(entry.address))
  if (gains.length) {
    const usd = gains.reduce((total, entry) => total + Math.max(0, entry.usd), 0)
    const worst = gains.reduce((a, b) => (b.usd > a.usd ? b : a))
    // No size threshold: Tenderly prices little outside mainnet, so a USD gate would blind us
    // exactly where we have least signal.
    signals.push({
      name: 'outsiderOutflow',
      weight: 40,
      detail: `${gains.length} address(es) end up holding value, incl. ${worst.amount} ${worst.symbol ?? short(worst.token)} to ${short(worst.address)}${usd ? ` (~$${Math.round(usd).toLocaleString()})` : ''}`,
      atCreation: true,
    })
  }

  const outsiderApprovals = facts.approvals.filter(a => isOutsider(a.spender) && !isOutsider(a.owner))
  // An approval moves nothing, so it is absent from asset changes. Same theft, deferred.
  if (outsiderApprovals.length) {
    signals.push({
      name: 'outsiderApproval',
      weight: 35,
      detail: `spend rights granted to ${outsiderApprovals.map(a => short(a.spender)).join(', ')}`,
      atCreation: true,
    })

    const unlimited = outsiderApprovals.filter(a => a.isUnlimited)
    if (unlimited.length) {
      signals.push({
        name: 'unlimitedApproval',
        weight: 15,
        detail: `unlimited allowance on ${unlimited.map(a => short(a.token)).join(', ')}`,
        atCreation: true,
      })
    }
  }

  const outsiderCalls = facts.calls.filter(call => isOutsider(call.to))
  const handovers = outsiderCalls.filter(call => call.functionName && GOVERNANCE_FN_NAMES.includes(call.functionName))
  if (handovers.length) {
    signals.push({
      name: 'controlHandover',
      weight: 30,
      detail: handovers.map(call => `${call.functionName}() on ${short(call.to)}`).join(', '),
      atCreation: true,
    })
  }

  // The catch-all: every shape we have not seen yet lands here.
  const opaque = outsiderCalls.filter(call => !call.functionName)
  if (opaque.length) {
    const targets = [...new Set(opaque.map(call => short(call.to)))]
    signals.push({
      name: 'opaqueExternalCall',
      weight: 15,
      detail: `${opaque.length} undecodable call(s) to ${targets.slice(0, 3).join(', ')}`,
      atCreation: true,
    })
  }

  // Not innocence: these execute at `endDate`, against a state days away.
  if (facts.status === 'reverted') {
    signals.push({
      name: 'simulationReverted',
      weight: 10,
      detail: facts.error ? `would revert today: ${facts.error}` : 'would revert against current state',
      atCreation: true,
    })
  }

  return signals
}
