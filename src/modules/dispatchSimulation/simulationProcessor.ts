/**
 * Simulation processor for dispatch summary
 * Transforms Tenderly asset_changes into grouped summaries
 */

import { formatUnits } from 'ethers'
import {
  type IAddressDelta,
  type IAddressTokenDelta,
  type IDispatchSimulationSummary,
  type IFlowToken,
  ISimulationStatus,
  type ISummaryGroup,
  type ITenderlyAssetChange,
  type ITenderlyFullResult,
} from '@types'
import { type AddressMapper } from './addressMapper'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Tenderly token info to our IFlowToken.
 */
function toFlowToken(tokenInfo: ITenderlyAssetChange['token_info'] | undefined): IFlowToken {
  if (!tokenInfo) {
    return {
      address: '',
      symbol: 'Unknown',
      name: 'Unknown Token',
      decimals: 18,
    }
  }
  return {
    address: tokenInfo.contract_address ?? '',
    symbol: tokenInfo.symbol ?? 'Unknown',
    name: tokenInfo.name ?? 'Unknown Token',
    decimals: tokenInfo.decimals ?? 18,
    logo: tokenInfo.logo,
    dollarValue: tokenInfo.dollar_value,
  }
}

function isZeroAmount(value: string | number | undefined): boolean {
  if (value == null) {
    return true
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isNaN(parsed) || Math.abs(parsed) < 1e-9
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Build summary groups from asset changes.
 * Groups addresses by DAO (main + subDAOs) vs External (everything else).
 */
function buildSummaryGroups(assetChanges: ITenderlyAssetChange[], mapper: AddressMapper): ISummaryGroup[] {
  const addressMap = new Map<string, Map<string, { token: IFlowToken; rawAmount: bigint; dollarValue: number }>>()

  const updateDelta = (address: string, token: IFlowToken, rawAmountDelta: bigint, dollarDelta: number) => {
    const normalized = address.toLowerCase()
    const tokenMap = addressMap.get(normalized) ?? new Map()
    const existing = tokenMap.get(token.address) ?? {
      token,
      rawAmount: 0n,
      dollarValue: 0,
    }
    tokenMap.set(token.address, {
      token,
      rawAmount: existing.rawAmount + rawAmountDelta,
      dollarValue: existing.dollarValue + dollarDelta,
    })
    addressMap.set(normalized, tokenMap)
  }

  assetChanges.forEach(change => {
    if (!change.from) {
      return
    }
    if (!change.to) {
      return
    }
    if (isZeroAmount(change.amount)) {
      return
    }
    const token = toFlowToken(change.token_info)
    let rawAmount: bigint
    try {
      rawAmount = BigInt(change.raw_amount)
    } catch {
      return
    }
    if (rawAmount === 0n) {
      return
    }
    const dollarValue = Number.parseFloat(change.dollar_value ?? '0')

    updateDelta(change.to, token, rawAmount, dollarValue)
    updateDelta(change.from, token, -rawAmount, -dollarValue)
  })

  const toAddressDelta = (
    address: string,
    tokenMap: Map<string, { token: IFlowToken; rawAmount: bigint; dollarValue: number }>,
  ): IAddressDelta | null => {
    const resolved = mapper.resolve(address)
    const tokens: IAddressTokenDelta[] = Array.from(tokenMap.values())
      .filter(entry => entry.rawAmount !== 0n)
      .map(entry => {
        const isNegative = entry.rawAmount < 0n
        const absRaw = isNegative ? -entry.rawAmount : entry.rawAmount
        const absDecimal = formatUnits(absRaw, entry.token.decimals)
        const signedDecimal = `${isNegative ? '-' : ''}${absDecimal}`

        return {
          token: entry.token,
          // Full-precision human-readable amount (signed, no leading '+')
          amount: signedDecimal,
          // Full-precision raw amount in smallest units (signed)
          rawAmount: entry.rawAmount.toString(),
          dollarValue: entry.dollarValue.toString(),
        }
      })

    if (!tokens.length) {
      return null
    }

    return {
      address,
      label: resolved.label,
      role: resolved.role,
      isKnown: resolved.isKnown,
      avatar: resolved.avatar ?? null,
      ens: resolved.ens ?? null,
      tokens,
    }
  }

  const deltas = Array.from(addressMap.entries())
    .map(([address, tokenMap]) => toAddressDelta(address, tokenMap))
    .filter((value): value is IAddressDelta => value != null)

  const sortByLabel = (a: IAddressDelta, b: IAddressDelta) => a.label.localeCompare(b.label)

  const daoItems = deltas
    .filter(d => d.role === 'dao' || d.role === 'subdao')
    .sort((a, b) => {
      if (a.role === 'dao' && b.role !== 'dao') {
        return -1
      }
      if (b.role === 'dao' && a.role !== 'dao') {
        return 1
      }
      return sortByLabel(a, b)
    })

  const externalItems = deltas.filter(d => d.role !== 'dao' && d.role !== 'subdao').sort(sortByLabel)

  const groups: ISummaryGroup[] = [
    { kind: 'dao', title: 'DAO', items: daoItems },
    { kind: 'external', title: 'External', items: externalItems },
  ]

  return groups.filter(group => group.items.length > 0)
}

/**
 * Process Tenderly full simulation response into dispatch simulation summary.
 */
export function processSimulation(
  tenderlyResult: ITenderlyFullResult,
  mapper: AddressMapper,
): IDispatchSimulationSummary {
  if (tenderlyResult.error || tenderlyResult.status === ISimulationStatus.FAILED) {
    return {
      status: 'failed',
      error: tenderlyResult.error || 'Simulation failed',
      tenderlyUrl: tenderlyResult.shareUrl,
      summaryGroups: [],
    }
  }

  const assetChanges = tenderlyResult.assetChanges ?? []
  const summaryGroups = buildSummaryGroups(assetChanges, mapper)

  return {
    status: 'success',
    tenderlyUrl: tenderlyResult.shareUrl,
    summaryGroups,
  }
}
