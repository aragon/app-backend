import { CrossChainExecuteSelectorCondition } from '@artifacts/CrossChainExecuteSelectorCondition'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { type HexAddress, IConditionInterfaceType, type NetworksEnum } from '@types'
import { Interface, id } from 'ethers'
import type { Provider } from 'ethers'

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

const ConditionDetector = {
  /**
   * Verify on-chain what a condition contract actually is. Returns null when the bytecode is
   * absent or does not match any known condition implementation — callers must treat null as
   * "unverified", never as an error.
   */
  detect: async (address: HexAddress, network: NetworksEnum): Promise<IConditionInterfaceType | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const bytecode = await provider.getCode(address)

      if (!bytecode || bytecode === '0x') {
        return null
      }

      const matchesExecuteSelector = EXECUTE_SELECTOR_TOPIC_SETS.some(topics =>
        topics.every(topic => bytecode.includes(topic)),
      )

      if (matchesExecuteSelector && (await ConditionDetector.isPermissionCondition(provider, address))) {
        return IConditionInterfaceType.executeSelector
      }

      return null
    } catch (error) {
      logger.warn('Failed to detect condition interface type', llo({ address, network, error }))
      return null
    }
  },

  /**
   * ERC-165 check. Any failure (no such function, revert, empty return, rpc error) means the
   * contract does not answer as a permission condition, so it is treated as not supported.
   */

  isPermissionCondition: async (provider: Provider, address: HexAddress): Promise<boolean> => {
    try {
      const result = await provider.call({
        to: address,
        data: supportsInterfaceInterface.encodeFunctionData('supportsInterface', [PERMISSION_CONDITION_INTERFACE_ID]),
      })

      const [supported] = supportsInterfaceInterface.decodeFunctionResult('supportsInterface', result)

      return supported === true
    } catch (error) {
      logger.verbose('Condition does not answer the ERC-165 permission condition check', llo({ address, error }))
      return false
    }
  },
}

export default ConditionDetector
