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

const SppBodyConditionHelper = {
  /**
   * Maps external SPP bodies (e.g. Safe wallets) to the condition contract deployed for them.
   *
   * External bodies are not OSx plugins, so no CREATE_PROPOSAL_PERMISSION grant exists for them.
   * Their condition (e.g. SafeOwnerCondition) is only discoverable as a sub-condition rule
   * (id 202) inside the SPP's own rule condition, matched back to a body via `safe()`.
   *
   * @param sppRuleConditionAddress The SPP plugin's proposalCreationConditionAddress (a RuledCondition)
   * @param externalBodyAddresses Stage body addresses without a Plugin document
   * @param network
   * @returns Map of lowercased body address -> condition contract address
   */
  async resolveExternalBodyConditions(
    sppRuleConditionAddress: HexAddress | null | undefined,
    externalBodyAddresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Map<string, HexAddress>> {
    const resolved = new Map<string, HexAddress>()

    if (!externalBodyAddresses.length) return resolved
    if (!sppRuleConditionAddress || sppRuleConditionAddress === ZeroAddress) return resolved

    const bodiesByLowercase = new Map(externalBodyAddresses.map(address => [address.toLowerCase(), address]))
    const provider = ProviderModule.getAnyRpcProvider(network)

    let rules: Array<{ id: bigint; value: bigint }>
    try {
      const ruleCondition = new Contract(sppRuleConditionAddress, RuledCondition.abi, provider)
      rules = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => ruleCondition.getRules()),
      )
    } catch (error) {
      logger.warn('Failed to read rules from SPP rule condition', llo({ sppRuleConditionAddress, network, error }))
      return resolved
    }

    const subConditions: HexAddress[] = []
    for (const rule of rules) {
      if (BigInt(rule.id) !== CONDITION_RULE_ID) continue

      try {
        const conditionAddressFromRuleValue = getAddress(toBeHex(rule.value, 20)) as HexAddress;
        subConditions.push(conditionAddressFromRuleValue)
      } catch (error) {
        logger.warn('Invalid sub-condition rule value', llo({ sppRuleConditionAddress, network, rule, error }))
      }
    }

    for (const conditionAddress of subConditions) {
      if (resolved.size === bodiesByLowercase.size) break

      try {
        const condition = new Contract(conditionAddress, SafeOwnerCondition.abi, provider)
        const safeAddress = await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(network).schedule(async () => condition.safe()),
        )

        if (bodiesByLowercase.has(String(safeAddress).toLowerCase())) {
          resolved.set(String(safeAddress).toLowerCase(), conditionAddress)
        }
      } catch (_error) {
        // Not a SafeOwnerCondition (e.g. an internal body's member-list condition) - skip
      }
    }

    return resolved
  },
}

export default SppBodyConditionHelper
