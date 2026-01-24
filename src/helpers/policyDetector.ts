import { keccak256 } from 'ethers'
import { type NetworksEnum, IPolicySourceType, IPolicyModelType } from '@types'
import ProviderModule from '@modules/provider'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helper:PolicyDetector' })

const SOURCE_FUNCTIONS = {
  streamBalance: ['token()', 'sourceBalance()', 'writeCheckpoint()', 'setPlugin(address)'],
  required: ['requiredBalance()'],
  fixed: ['targetAmount()'],
  drain: ['vault()', 'token()'],
}

const MODEL_FUNCTIONS = {
  gauge: ['gaugeVoter()'],
  brackets: ['brackets(uint256)'],
  ratio: ['recipients(uint256)', 'ratios(uint256)'],
  equalRatio: ['recipients(uint256)'],
}

const PolicyDetector = {
  _generateFunctionHash(functionSignature: string): string {
    return keccak256(Buffer.from(functionSignature)).slice(0, 10)
  },

  _hasFunction(bytecode: string, signature: string): boolean {
    return bytecode.includes(PolicyDetector._generateFunctionHash(signature).replace('0x', ''))
  },

  _hasFunctions(bytecode: string, functions: string[]): boolean {
    return functions.every(fn => PolicyDetector._hasFunction(bytecode, fn))
  },

  /**
   * Detect source type from bytecode
   */
  async detectSourceType(address: string, network: NetworksEnum): Promise<IPolicySourceType | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const bytecode = await provider.getCode(address)

      if (!bytecode || bytecode === '0x') {
        return null
      }

      // StreamBalanceSource - has amountPerEpoch, maxSourceBalance, epochInterval
      if (PolicyDetector._hasFunctions(bytecode, SOURCE_FUNCTIONS.streamBalance)) {
        return IPolicySourceType.streamBalance
      }

      // RequiredBalanceSource - has requiredBalance
      if (PolicyDetector._hasFunctions(bytecode, SOURCE_FUNCTIONS.required)) {
        return IPolicySourceType.required
      }

      // FixedBalanceSource - has targetAmount (no vault)
      if (PolicyDetector._hasFunctions(bytecode, SOURCE_FUNCTIONS.fixed)) {
        return IPolicySourceType.fixed
      }

      // DrainBalanceSource - has vault and token only (detected by exclusion)
      if (PolicyDetector._hasFunctions(bytecode, SOURCE_FUNCTIONS.drain)) {
        return IPolicySourceType.drain
      }

      return null
    } catch (error) {
      logger.error('Error detecting source type', llo({ address, network, error }))
      return null
    }
  },

  /**
   * Detect model type from bytecode
   */
  async detectModelType(address: string, network: NetworksEnum): Promise<IPolicyModelType | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const bytecode = await provider.getCode(address)

      if (!bytecode || bytecode === '0x') {
        return null
      }

      // GaugeRatioModel (Address or Token) - has gaugeVoter
      if (PolicyDetector._hasFunctions(bytecode, MODEL_FUNCTIONS.gauge)) {
        // Both AddressGaugeRatioModel and TokenGaugeRatioModel have gaugeVoter
        // Default to addressGauge for now
        return IPolicyModelType.addressGauge
      }

      // BracketsModel - has brackets(uint256)
      if (PolicyDetector._hasFunctions(bytecode, MODEL_FUNCTIONS.brackets)) {
        return IPolicyModelType.brackets
      }

      // RatioModel - has both recipients and ratios
      if (PolicyDetector._hasFunctions(bytecode, MODEL_FUNCTIONS.ratio)) {
        return IPolicyModelType.ratio
      }

      // EqualRatioModel - has recipients only (no ratios)
      if (PolicyDetector._hasFunctions(bytecode, MODEL_FUNCTIONS.equalRatio)) {
        return IPolicyModelType.equalRatio
      }

      return null
    } catch (error) {
      logger.error('Error detecting model type', llo({ address, network, error }))
      return null
    }
  },
}

export default PolicyDetector
