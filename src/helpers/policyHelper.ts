import { Contract, AbiCoder, Interface } from 'ethers'
import logger from '@logger'
import {
  IPluginInterfaceType,
  type NetworksEnum,
  IPolicySourceType,
  IPolicyModelType,
  IPolicyStrategyType,
  type IPolicySourceData,
  type IPolicyModelData,
  type HexAddress,
} from '@types'
import ProviderModule from '@modules/provider'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import {
  PluginSourcesAbi,
  DrainBalanceSource,
  RatioModel,
  EqualRatioModel,
  AddressGaugeRatioModel,
  RouterPluginBase,
  StreamBalanceSource,
  RequiredBalanceSource,
  FixedBalanceSource,
} from '@artifacts/CapitalRouter'
import PolicyDetector from '@helpers/policyDetector'

const llo = logger.logMeta.bind(null, { service: 'helper:PolicyHelper' })

// Plugin ID string constants from Solidity contracts
const POLICY_PLUGIN_IDS = {
  STD_ROUTER: 'org.aragon.router.std',
  MULTI_ROUTER: 'org.aragon.router.multi',
  BURN_ROUTER: 'org.aragon.router.burn',
  UNISWAP_ROUTER: 'org.aragon.router.uniswap',
  MULTI_DISPATCH: 'org.aragon.router.multi-dispatch',
  STD_CLAIMER: 'org.aragon.claimer.std',
  MULTI_CLAIMER: 'org.aragon.claimer.multi',
} as const

// Map plugin ID to a strategy type
const PLUGIN_ID_TO_STRATEGY: Record<string, IPolicyStrategyType> = {
  [POLICY_PLUGIN_IDS.STD_ROUTER]: IPolicyStrategyType.router,
  [POLICY_PLUGIN_IDS.MULTI_ROUTER]: IPolicyStrategyType.multiRouter,
  [POLICY_PLUGIN_IDS.BURN_ROUTER]: IPolicyStrategyType.burnRouter,
  [POLICY_PLUGIN_IDS.UNISWAP_ROUTER]: IPolicyStrategyType.uniswapRouter,
  [POLICY_PLUGIN_IDS.MULTI_DISPATCH]: IPolicyStrategyType.multiDispatch,
  [POLICY_PLUGIN_IDS.STD_CLAIMER]: IPolicyStrategyType.claimer,
  [POLICY_PLUGIN_IDS.MULTI_CLAIMER]: IPolicyStrategyType.multiClaimer,
}

const PolicyHelper = {
  /**
   * Get a strategy type by calling pluginId() on-chain
   */
  getStrategyType: async (pluginAddress: HexAddress, network: NetworksEnum): Promise<IPolicyStrategyType | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, RouterPluginBase.abi, provider)
      const pluginId = await contract.pluginId()
      return PLUGIN_ID_TO_STRATEGY[pluginId] ?? null
    } catch (error) {
      logger.error('Error fetching plugin strategy type', llo({ error, pluginAddress, network }))
      return null
    }
  },

  /**
   * Get Source address via on-chain call to plugin.sources()
   */
  getSourceAddress: async (pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, PluginSourcesAbi, provider)
      const addresses = await contract.sources()
      return addresses[0]
    } catch (error) {
      logger.error('Error fetching source addresses', llo({ error, pluginAddress, network }))
      return null
    }
  },

  /**
   * Decode the prepareInstallation call input to get the installation data (bytes)
   */
  decodeInstallationData: (txInput: string): string | null => {
    try {
      const iface = new Interface(PluginSetupProcessor.abi)
      const decoded = iface.parseTransaction({ data: txInput })

      if (decoded?.name === 'prepareInstallation') {
        return decoded.args._params.data
      }

      return null
    } catch (error) {
      logger.error('Error decoding prepareInstallation tx', llo({ error }))
      return null
    }
  },

  /**
   * Decode installation params and return the model address
   * Router: abi.encode(routerSource, isStreamingSource, routerModel)
   * Claimer: abi.encode(claimerSource, claimerModel)
   */
  getModelAddress: (interfaceType: string, installationData: string): string | null => {
    try {
      const abiCoder = AbiCoder.defaultAbiCoder()

      if (interfaceType === IPluginInterfaceType.router) {
        const decoded = abiCoder.decode(['address', 'bool', 'address'], installationData)
        return decoded[2]
      } else if (interfaceType === IPluginInterfaceType.claimer) {
        const decoded = abiCoder.decode(['address', 'address'], installationData)
        return decoded[1]
      }

      return null
    } catch (error) {
      logger.error('Error decoding model address', llo({ error, interfaceType }))
      return null
    }
  },

  /**
   * Fetch source data - returns base data with type only
   * Actual values will be populated from events via policyHandler
   */
  getSourceData: async (sourceAddress: string, network: NetworksEnum): Promise<IPolicySourceData | null> => {
    try {
      const sourceType = await PolicyDetector.detectSourceType(sourceAddress, network)

      if (!sourceType) {
        logger.warn('Could not detect source type', llo({ sourceAddress, network }))
        return null
      }

      const provider = ProviderModule.getAnyRpcProvider(network)

      const baseData: IPolicySourceData = {
        address: sourceAddress,
        type: sourceType,
        vaultAddress: null,
        tokenAddress: null,
        amountPerEpoch: null,
        maxSourceBalance: null,
        epochInterval: null,
        requiredBalance: null,
        targetAmount: null,
      }

      switch (sourceType) {
        case IPolicySourceType.drain: {
          const contract = new Contract(sourceAddress, DrainBalanceSource.abi, provider)
          baseData.vaultAddress = await contract.vault()
          baseData.tokenAddress = await contract.token()
          break
        }
        case IPolicySourceType.required: {
          const contract = new Contract(sourceAddress, RequiredBalanceSource.abi, provider)
          baseData.vaultAddress = await contract.vault()
          baseData.tokenAddress = await contract.token()
          const reqBalance = await contract.requiredBalance()
          baseData.requiredBalance = reqBalance.toString()
          break
        }
        case IPolicySourceType.streamBalance: {
          const contract = new Contract(sourceAddress, StreamBalanceSource.abi, provider)
          baseData.tokenAddress = await contract.token()
          break
        }
        case IPolicySourceType.fixed: {
          const contract = new Contract(sourceAddress, FixedBalanceSource.abi, provider)
          baseData.tokenAddress = await contract.token()
          const targetAmount = await contract.targetAmount()
          baseData.targetAmount = targetAmount.toString()
          break
        }
      }

      return baseData
    } catch (error) {
      logger.error('Error fetching source data', llo({ error, sourceAddress, network }))
      return null
    }
  },

  /**
   * Fetch model data on-chain based on the detected type
   */
  getModelData: async (modelAddress: string, network: NetworksEnum): Promise<IPolicyModelData | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const modelType = await PolicyDetector.detectModelType(modelAddress, network)

      if (!modelType) {
        logger.warn('Could not detect model type', llo({ modelAddress, network }))
        return null
      }

      const baseData: IPolicyModelData = {
        address: modelAddress,
        type: modelType,
        recipients: [],
        ratios: [],
        gaugeVoterAddress: null,
        brackets: [],
      }

      switch (modelType) {
        case IPolicyModelType.addressGauge:
        case IPolicyModelType.tokenGauge: {
          const contract = new Contract(modelAddress, AddressGaugeRatioModel.abi, provider)
          baseData.gaugeVoterAddress = await contract.gaugeVoter()
          break
        }
        case IPolicyModelType.ratio: {
          const contract = new Contract(modelAddress, RatioModel.abi, provider)
          const recipients: string[] = []
          const ratios: number[] = []
          let i = 0
          while (true) {
            try {
              const recipient = await contract.recipients(i)
              const ratio = await contract.ratios(i)
              recipients.push(recipient)
              ratios.push(Number(ratio))
              i++
            } catch {
              break
            }
          }
          baseData.recipients = recipients
          baseData.ratios = ratios
          break
        }
        case IPolicyModelType.equalRatio: {
          const contract = new Contract(modelAddress, EqualRatioModel.abi, provider)
          const recipients: string[] = []
          let i = 0
          while (true) {
            try {
              const recipient = await contract.recipients(i)
              recipients.push(recipient)
              i++
            } catch {
              break
            }
          }
          baseData.recipients = recipients
          break
        }
        case IPolicyModelType.brackets: {
          // TODO: Implement brackets fetching if needed
          break
        }
      }

      return baseData
    } catch (error) {
      logger.error('Error fetching model data', llo({ error, modelAddress, network }))
      return null
    }
  },
}

export default PolicyHelper
