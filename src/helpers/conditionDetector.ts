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
import { Interface, id, isError } from 'ethers'

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
   * Returns null when the contract is not a known permission condition.
   * A failed chain or RPC read throws.
   */
  detect: async (address: HexAddress, network: NetworksEnum): Promise<IConditionInterfaceType | null> => {
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
  },

  /**
   * ERC-165 reverts or bad return data mean unsupported. RPC failures throw.
   */

  isPermissionCondition: async (provider: Provider, address: HexAddress, network: NetworksEnum): Promise<boolean> => {
    let result: string
    try {
      result = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          provider.call({
            to: address,
            data: supportsInterfaceInterface.encodeFunctionData('supportsInterface', [
              PERMISSION_CONDITION_INTERFACE_ID,
            ]),
          }),
        ),
      )
    } catch (error) {
      if (!isError(error, 'CALL_EXCEPTION')) throw error
      logger.verbose('Condition does not answer the ERC-165 permission condition check', llo({ address, error }))
      return false
    }

    try {
      const [supported] = supportsInterfaceInterface.decodeFunctionResult('supportsInterface', result)

      return supported === true
    } catch (error) {
      logger.verbose('Condition does not answer the ERC-165 permission condition check', llo({ address, error }))
      return false
    }
  },
}

export default ConditionDetector
