import { CrossChainExecuteSelectorCondition } from '@artifacts/CrossChainExecuteSelectorCondition'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import ContractHelper from '@helpers/contractHelper'
import ProxyContractHelper from '@helpers/proxyContract'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, IConditionInterfaceType, type NetworksEnum } from '@types'
import type { Provider } from 'ethers'
import { Interface, id } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:ConditionDetector' })

// Event topic hashes are embedded in runtime bytecode as PUSH32 constants, so their presence
// identifies the condition implementation even though the DAO-address immutable makes raw
const EXECUTE_SELECTOR_TOPIC_SETS = [ExecuteSelectorCondition.abi, CrossChainExecuteSelectorCondition.abi].map(abi => {
  const contractInterface = new Interface(abi)
  return ['SelectorAllowed', 'SelectorDisallowed'].map(event =>
    contractInterface.getEvent(event)!.topicHash.replace('0x', ''),
  )
})

const supportsInterfaceInterface = new Interface(['function supportsInterface(bytes4 interfaceId) view returns (bool)'])

const PERMISSION_CONDITION_INTERFACE_ID = id('isGranted(address,address,bytes32,bytes)').slice(0, 10)

const SPP_RULE_CONDITION_SELECTORS = [
  id('getRules()').slice(2, 10),
  id('initialize(address,(uint8,uint8,uint240,bytes32)[])').slice(2, 10),
  id('updateRules((uint8,uint8,uint240,bytes32)[])').slice(2, 10),
]

const ConditionDetector = {
  /**
   * Verify on-chain what a condition contract actually is. Returns null when the bytecode is
   * absent or does not match any known condition implementation — callers must treat null as
   * "unverified", never as an error.
   */
  detect: async (address: HexAddress, network: NetworksEnum): Promise<IConditionInterfaceType | null> => {
    try {
      const conditionBytecode = await ContractHelper.getBytecode(address, network)

      if (!conditionBytecode) {
        return null
      }

      const implementationAddress = ProxyContractHelper._getImplementationForMinimalProxy(conditionBytecode)
      const implementationBytecode = implementationAddress
        ? await ContractHelper.getBytecode(implementationAddress, network)
        : conditionBytecode
      if (!implementationBytecode) {
        return null
      }

      const matchesExecuteSelector = EXECUTE_SELECTOR_TOPIC_SETS.some(topics =>
        topics.every(topic => implementationBytecode.includes(topic)),
      )
      const matchesSppRule = SPP_RULE_CONDITION_SELECTORS.every(selector => implementationBytecode.includes(selector))

      if (!(matchesExecuteSelector || matchesSppRule)) {
        return null
      }

      const provider = ProviderModule.getAnyRpcProvider(network)

      if (!(await ConditionDetector.isPermissionCondition(provider, address, network))) {
        return null
      }

      return matchesExecuteSelector ? IConditionInterfaceType.executeSelector : IConditionInterfaceType.sppRule
    } catch (error) {
      logger.warn('Failed to detect condition interface type', llo({ address, network, error }))
      return null
    }
  },

  /**
   * ERC-165 check. Any failure (no such function, revert, empty return, rpc error) means the
   * contract does not answer as a permission condition, so it is treated as not supported.
   */

  isPermissionCondition: async (provider: Provider, address: HexAddress, network: NetworksEnum): Promise<boolean> => {
    try {
      const result = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          provider.call({
            to: address,
            data: supportsInterfaceInterface.encodeFunctionData('supportsInterface', [
              PERMISSION_CONDITION_INTERFACE_ID,
            ]),
          }),
        ),
      )

      const [supported] = supportsInterfaceInterface.decodeFunctionResult('supportsInterface', result)

      return supported === true
    } catch (error) {
      logger.verbose('Condition does not answer the ERC-165 permission condition check', llo({ address, error }))
      return false
    }
  },
}

export default ConditionDetector
