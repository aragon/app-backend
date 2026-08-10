import { CrossChainExecuteSelectorCondition } from '@artifacts/CrossChainExecuteSelectorCondition'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { type HexAddress, IConditionInterfaceType, type NetworksEnum } from '@types'
import { Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:ConditionDetector' })

// Event topic hashes are embedded in runtime bytecode as PUSH32 constants, so their presence
// identifies the condition implementation even though the DAO-address immutable makes raw
// codehashes differ between deployments of the same contract.
const EXECUTE_SELECTOR_TOPICS = [
  new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorAllowed')?.topicHash,
  new Interface(CrossChainExecuteSelectorCondition.abi).getEvent('SelectorAllowed')?.topicHash,
].map(topic => topic!.replace('0x', ''))

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

      if (EXECUTE_SELECTOR_TOPICS.some(topic => bytecode.includes(topic))) {
        return IConditionInterfaceType.executeSelector
      }

      return null
    } catch (error) {
      logger.warn('Failed to detect condition interface type', llo({ address, network, error }))
      return null
    }
  },
}

export default ConditionDetector
