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

const SppBodyConditionHelper = {
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
