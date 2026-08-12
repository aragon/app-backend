import { RuledCondition, SafeOwnerCondition } from '@artifacts/RuledCondition'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type NetworksEnum } from '@types'
import { Contract, getAddress, toBeHex, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:SppBodyCondition' })

// RuledCondition rule id referencing a sub-condition contract
const CONDITION_RULE_ID = 202n

export interface SppProposerCondition {
  /** Checksummed Safe address the sub-condition guards */
  safeAddress: HexAddress
  /** Checksummed sub-condition contract address (a SafeOwnerCondition) */
  conditionAddress: HexAddress
}

export interface SppConditionRule {
  type: 'block-number' | 'timestamp' | 'condition' | 'logic' | 'value' | 'unknown'
  operation:
    | 'none'
    | 'eq'
    | 'neq'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'return'
    | 'not'
    | 'and'
    | 'or'
    | 'xor'
    | 'if-else'
    | 'unknown'
  value: string
  permissionId: string
  ruleIndexes?: number[]
  conditionAddress?: HexAddress
}

const RULE_TYPES: Record<number, SppConditionRule['type']> = {
  200: 'block-number',
  201: 'timestamp',
  202: 'condition',
  203: 'logic',
  204: 'value',
}

const RULE_OPERATIONS: SppConditionRule['operation'][] = [
  'none',
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'return',
  'not',
  'and',
  'or',
  'xor',
  'if-else',
]

const SppBodyConditionHelper = {
  /**
   * Reads and normalizes an SPP rule condition for persistence and API responses.
   * Rule references are packed into 32-bit segments in the contract's uint240 value.
   */
  readSppRules: async (conditionAddress: HexAddress, network: NetworksEnum): Promise<SppConditionRule[]> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const condition = new Contract(conditionAddress, RuledCondition.abi, provider)
    const rules = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () => condition.getRules()),
    )

    return rules.map((rule: { id: bigint; op: bigint; value: bigint; permissionId: string | bigint }) => {
      const id = Number(rule.id)
      const operationIndex = Number(rule.op)
      const value = BigInt(rule.value)
      const normalized: SppConditionRule = {
        type: RULE_TYPES[id] ?? 'unknown',
        operation: RULE_OPERATIONS[operationIndex] ?? 'unknown',
        value: value.toString(),
        permissionId:
          typeof rule.permissionId === 'string' ? rule.permissionId : toBeHex(BigInt(rule.permissionId), 32),
      }

      if (id === 202) {
        normalized.conditionAddress = getAddress(toBeHex(value, 20)) as HexAddress
      }

      if (id === 203) {
        const referenceCount = operationIndex === 12 ? 3 : operationIndex === 8 || operationIndex === 7 ? 1 : 2
        normalized.ruleIndexes = Array.from({ length: referenceCount }, (_, index) =>
          Number((value >> BigInt(index * 32)) & 0xffffffffn),
        )
      }

      return normalized
    })
  },
  /**
   * Discovers every Safe granted proposal-creation permission on an SPP process.
   *
   * External bodies (and non-body proposers) are not OSx plugins, so no CREATE_PROPOSAL_PERMISSION
   * grant exists for them. Each allowed Safe is only discoverable as a sub-condition rule (id 202)
   * inside the SPP's own rule condition, whose guarded Safe is read via `safe()`.
   *
   * Returns every discovered Safe regardless of whether it is a stage body; the caller decides
   * which are bodies and which are non-body "external proposers".
   *
   * @param sppRuleConditionAddress The SPP plugin's proposalCreationConditionAddress (a RuledCondition)
   * @param network
   * @returns Map of lowercased Safe address -> { safeAddress, conditionAddress } (checksummed)
   */
  async resolveSppProposerConditions(
    sppRuleConditionAddress: HexAddress | null | undefined,
    network: NetworksEnum,
  ): Promise<Map<string, SppProposerCondition>> {
    const resolved = new Map<string, SppProposerCondition>()

    if (!sppRuleConditionAddress || sppRuleConditionAddress === ZeroAddress) return resolved

    const provider = ProviderModule.getAnyRpcProvider(network)

    let rules: Array<{ id: bigint; value: bigint }>
    try {
      const ruleCondition = new Contract(sppRuleConditionAddress, RuledCondition.abi, provider)
      rules = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => ruleCondition.getRules()),
      )
    } catch (error) {
      logger.warn('Failed to read rules from SPP rule condition', llo({ sppRuleConditionAddress, network, error }))
      // Propagate: unlike "no rule condition" or "not a SafeOwnerCondition", this means we couldn't
      // determine the proposers at all. The caller must not treat this the same as "zero proposers".
      throw error
    }

    const subConditions: HexAddress[] = []
    for (const rule of rules) {
      if (BigInt(rule.id) !== CONDITION_RULE_ID) continue

      try {
        const conditionAddressFromRuleValue = getAddress(toBeHex(rule.value, 20)) as HexAddress
        subConditions.push(conditionAddressFromRuleValue)
      } catch (error) {
        logger.warn('Invalid sub-condition rule value', llo({ sppRuleConditionAddress, network, rule, error }))
      }
    }

    // Probe every sub-condition in parallel; there are only a handful per SPP and the Bottleneck
    // limiter still caps the actual RPC concurrency.
    const probes = await Promise.all(
      subConditions.map(async conditionAddress => {
        try {
          const condition = new Contract(conditionAddress, SafeOwnerCondition.abi, provider)
          const safeAddress = await retryRequest(async () =>
            BottleneckModule.getNodeLimiter(network).schedule(async () => condition.safe()),
          )
          return { conditionAddress, safeAddress: getAddress(String(safeAddress)) as HexAddress }
        } catch (_error) {
          // Not a SafeOwnerCondition (e.g. an internal body's member-list condition) - skip
          return null
        }
      }),
    )

    for (const probe of probes) {
      if (probe) {
        resolved.set(probe.safeAddress.toLowerCase(), probe)
      }
    }

    return resolved
  },
}

export default SppBodyConditionHelper
