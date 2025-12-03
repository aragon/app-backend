import { Contract, AbiCoder, type TransactionReceipt } from 'ethers'
import logger from '@logger'
import {
  IPluginInterfaceType,
  type NetworksEnum,
  // IPolicySourceType,
  // IPolicyModelType,
  IPolicyStrategyType,
  type IPolicySourceData,
  type IPolicyModelData,
  type HexAddress,
  IEventLogPluginType,
  type IPolicyModelBracket,
  IPolicySourceType,
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
  BracketsModel,
  RouterPlugin,
  ClaimerPlugin,
  MultiRouterPlugin,
  MultiClaimerPlugin,
} from '@artifacts/CapitalRouter'
import PolicyDetector from '@helpers/policyDetector'
import Web3Utils from '@helpers/web3Utils'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import utils from '@helpers/utils'

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
   * Get a strategy type and pluginId by calling pluginId() on-chain
   * Returns both the raw pluginId (for policyKey) and the mapped strategyType
   */
  getStrategyTypeAndPluginId: async (
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ strategyType: IPolicyStrategyType; policyKey: string } | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, RouterPluginBase.abi, provider)

      const pluginId = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.pluginId()),
      )

      const strategyType = PLUGIN_ID_TO_STRATEGY[pluginId]
      if (!strategyType) return null

      return { strategyType, policyKey: pluginId }
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

      const addresses = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.sources()),
      )

      return addresses[0]
    } catch (error) {
      logger.error('Error fetching source addresses', llo({ error, pluginAddress, network }))
      return null
    }
  },

  /**
   * Fetch drain source data (vault + token)
   */
  _getDrainSourceData: async (
    sourceAddress: string,
    network: NetworksEnum,
  ): Promise<{ vaultAddress: string; tokenAddress: string }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(sourceAddress, DrainBalanceSource.abi, provider)

    const [vaultAddress, tokenAddress] = await Promise.all([
      retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.vault())),
      retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.token())),
    ])

    return { vaultAddress, tokenAddress }
  },

  /**
   * Fetch required source data (vault + token + requiredBalance)
   */
  _getRequiredSourceData: async (sourceAddress: string, network: NetworksEnum): Promise<{ tokenAddress: string }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(sourceAddress, RequiredBalanceSource.abi, provider)

    const [tokenAddress] = await Promise.all([
      // retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.vault())),
      retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.token())),
      // retryRequest(async () =>
      //   BottleneckModule.getNodeLimiter(network).schedule(async () => contract.requiredBalance()),
      // ),
    ])

    return { tokenAddress }
  },

  /**
   * Fetch stream source data (token)
   */
  _getStreamSourceData: async (sourceAddress: string, network: NetworksEnum): Promise<{ tokenAddress: string }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(sourceAddress, StreamBalanceSource.abi, provider)

    const tokenAddress = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () => contract.token()),
    )

    return { tokenAddress }
  },

  /**
   * Fetch fixed source data (token + targetAmount)
   */
  _getFixedSourceData: async (
    sourceAddress: string,
    network: NetworksEnum,
  ): Promise<{ tokenAddress: string; targetAmount: string }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(sourceAddress, FixedBalanceSource.abi, provider)

    const [tokenAddress, targetAmount] = await Promise.all([
      retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.token())),
      retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.sourceBalance())),
    ])

    return { tokenAddress, targetAmount: targetAmount.toString() }
  },

  /**
   * Fetch gauge model data (gaugeVoter)
   */
  _getGaugeModelData: async (modelAddress: string, network: NetworksEnum): Promise<{ gaugeVoterAddress: string }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(modelAddress, AddressGaugeRatioModel.abi, provider)

    const gaugeVoterAddress = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () => contract.gaugeVoter()),
    )

    return { gaugeVoterAddress }
  },

  /**
   * Fetch ratio model data (recipients + ratios)
   */
  _getRatioModelData: async (
    modelAddress: string,
    network: NetworksEnum,
  ): Promise<{ recipients: string[]; ratios: number[] }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(modelAddress, RatioModel.abi, provider)

    const count = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () => contract.recipientCount(0)),
    )

    const recipientCount = Number(count)
    const fetchPromises: Promise<[string, bigint]>[] = []

    for (let i = 0; i < recipientCount; i++) {
      fetchPromises.push(
        Promise.all([
          retryRequest(async () =>
            BottleneckModule.getNodeLimiter(network).schedule(async () => contract.recipients(i)),
          ),
          retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.ratios(i))),
        ]),
      )
    }

    const results = await Promise.all(fetchPromises)
    const recipients = results.map(([recipient]) => recipient)
    const ratios = results.map(([, ratio]) => Number(ratio))

    return { recipients, ratios }
  },

  /**
   * Fetch equal ratio model data (recipients)
   */
  _getEqualRatioModelData: async (modelAddress: string, network: NetworksEnum): Promise<{ recipients: string[] }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(modelAddress, EqualRatioModel.abi, provider)

    const count = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () => contract.recipientCount(0)),
    )

    const recipientCount = Number(count)
    const fetchPromises: Promise<string>[] = []

    for (let i = 0; i < recipientCount; i++) {
      fetchPromises.push(
        retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.recipients(i))),
      )
    }

    const recipients = await Promise.all(fetchPromises)

    return { recipients }
  },

  /**
   * Fetch brackets model data by iterating until it reverts
   */
  _getBracketsModelData: async (
    modelAddress: string,
    network: NetworksEnum,
  ): Promise<{ brackets: IPolicyModelBracket[] }> => {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(modelAddress, BracketsModel.abi, provider)

    const brackets: IPolicyModelBracket[] = []
    let i = 0

    while (true) {
      try {
        const bracket = await BottleneckModule.getNodeLimiter(network).schedule(async () => contract.brackets(i))

        brackets.push({
          threshold: bracket.threshold.toString(),
          routerModelAddress: bracket.routerModel !== utils.zeroAddress ? bracket.routerModel : null,
          claimerModelAddress: bracket.claimerModel !== utils.zeroAddress ? bracket.claimerModel : null,
        })
        i++
      } catch {
        break
      }
    }

    return { brackets }
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
          const data = await PolicyHelper._getDrainSourceData(sourceAddress, network)
          baseData.vaultAddress = data.vaultAddress
          baseData.tokenAddress = data.tokenAddress
          break
        }
        case IPolicySourceType.required: {
          const data = await PolicyHelper._getRequiredSourceData(sourceAddress, network)
          baseData.tokenAddress = data.tokenAddress
          break
        }
        case IPolicySourceType.streamBalance: {
          const data = await PolicyHelper._getStreamSourceData(sourceAddress, network)
          baseData.tokenAddress = data.tokenAddress
          break
        }
        case IPolicySourceType.fixed: {
          const data = await PolicyHelper._getFixedSourceData(sourceAddress, network)
          baseData.tokenAddress = data.tokenAddress
          baseData.targetAmount = data.targetAmount
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
   * Extract model address from InstallationPrepared event in transaction receipt.
   * The event contains a ` data ` field with encoded installation params.
   * Router: abi.encode(routerSource, isStreamingSource, routerModel)
   * Claimer: abi.encode(claimerSource, claimerModel)
   */
  getModelAddressFromEvent: (
    txReceipt: TransactionReceipt,
    pluginAddress: HexAddress,
    interfaceType: string,
  ): string | null => {
    try {
      const logs = Web3Utils.findLogsByName(
        txReceipt,
        IEventLogPluginType.InstallationPrepared,
        PluginSetupProcessor.abi,
      )

      const matchingLog = logs.find(log => {
        if (!log.parsed) return false
        const eventPluginAddress = log.parsed.args.plugin
        return eventPluginAddress === pluginAddress
      })

      if (!matchingLog?.parsed) {
        logger.warn('InstallationPrepared event not found for plugin', llo({ pluginAddress }))
        return null
      }

      const installationData = matchingLog.parsed.args.data

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
      logger.error('Error extracting model address from event', llo({ error, pluginAddress }))
      return null
    }
  },

  /**
   * Fetch model data on-chain based on the detected type
   */
  getModelData: async (modelAddress: string, network: NetworksEnum): Promise<IPolicyModelData | null> => {
    try {
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

      // switch (modelType) {
      //   case IPolicyModelType.addressGauge:
      //   case IPolicyModelType.tokenGauge: {
      //     const data = await PolicyHelper._getGaugeModelData(modelAddress, network)
      //     baseData.gaugeVoterAddress = data.gaugeVoterAddress
      //     break
      //   }
      //   case IPolicyModelType.ratio: {
      //     const data = await PolicyHelper._getRatioModelData(modelAddress, network)
      //     baseData.recipients = data.recipients
      //     baseData.ratios = data.ratios
      //     break
      //   }
      //   case IPolicyModelType.equalRatio: {
      //     const data = await PolicyHelper._getEqualRatioModelData(modelAddress, network)
      //     baseData.recipients = data.recipients
      //     break
      //   }
      //   case IPolicyModelType.brackets: {
      //     const data = await PolicyHelper._getBracketsModelData(modelAddress, network)
      //     baseData.brackets = data.brackets
      //     break
      //   }
      // }

      return baseData
    } catch (error) {
      logger.error('Error fetching model data', llo({ error, modelAddress, network }))
      return null
    }
  },

  /**
   * Get model address via on-chain call for RouterPlugin or ClaimerPlugin
   * - RouterPlugin: calls routerModel()
   * - ClaimerPlugin: calls claimerModel()
   */
  getModelAddress: async (
    pluginAddress: HexAddress,
    network: NetworksEnum,
    strategyType: IPolicyStrategyType,
  ): Promise<HexAddress | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)

      if (strategyType === IPolicyStrategyType.router) {
        const contract = new Contract(pluginAddress, RouterPlugin.abi, provider)
        const modelAddress = await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(network).schedule(async () => contract.routerModel()),
        )
        return modelAddress !== utils.zeroAddress ? modelAddress : null
      }

      if (strategyType === IPolicyStrategyType.claimer) {
        const contract = new Contract(pluginAddress, ClaimerPlugin.abi, provider)
        const modelAddress = await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(network).schedule(async () => contract.claimerModel()),
        )
        return modelAddress !== utils.zeroAddress ? modelAddress : null
      }

      return null
    } catch (error) {
      logger.error('Error fetching model address', llo({ error, pluginAddress, network }))
      return null
    }
  },

  /**
   * Get subrouters array for MultiRouterPlugin or MultiDispatchPlugin
   * Iterates until revert
   */
  getSubRouters: async (pluginAddress: HexAddress, network: NetworksEnum): Promise<string[]> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, MultiRouterPlugin.abi, provider)

      const subRouters: string[] = []
      let i = 0

      while (true) {
        try {
          const address = await BottleneckModule.getNodeLimiter(network).schedule(async () => contract.subrouters(i))
          subRouters.push(address)
          i++
        } catch {
          break
        }
      }

      return subRouters
    } catch (error) {
      logger.error('Error fetching subrouters', llo({ error, pluginAddress, network }))
      return []
    }
  },

  /**
   * Get subclaimers array for MultiClaimerPlugin
   * Iterates until revert
   */
  getSubClaimers: async (pluginAddress: HexAddress, network: NetworksEnum): Promise<string[]> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, MultiClaimerPlugin.abi, provider)

      const subClaimers: string[] = []
      let i = 0

      while (true) {
        try {
          const address = await BottleneckModule.getNodeLimiter(network).schedule(async () => contract.subclaimers(i))
          subClaimers.push(address)
          i++
        } catch {
          break
        }
      }

      return subClaimers
    } catch (error) {
      logger.error('Error fetching subclaimers', llo({ error, pluginAddress, network }))
      return []
    }
  },
}

export default PolicyHelper
