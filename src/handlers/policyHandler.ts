import logger from '@logger'
import type { LogDescription } from 'ethers'
import { type ILogInfo, type HexAddress, IPolicySourceType, IEventLogPolicyType } from '@types'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import PolicyHelper from '@helpers/policyHelper'

const llo = logger.logMeta.bind(null, { service: 'handler:PolicyHandler' })

export const PolicyHandler = {
  /**
   * Handle SourceSettingsUpdated event from StreamBalanceSource
   * Event: SourceSettingsUpdated(address _vault, IERC20 _vaultToken, uint256 _amountPerEpoch, uint256 _maxSourceBalance, uint256 _epochInterval)
   */
  sourceSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const sourceAddress = info.address
    const network = info.network

    const setting = await Models.Setting.findByPolicySourceAddress(sourceAddress, network)

    if (!setting || setting.policy.source.type !== IPolicySourceType.streamBalance) {
      logger.warn('No Setting found for source address', llo({ sourceAddress, network }))
      return
    }

    const sourceData = event.args

    setting.policy.source = {
      ...setting.policy.source,
      vaultAddress: sourceData._vault,
      tokenAddress: sourceData._vaultToken,
      amountPerEpoch: sourceData._amountPerEpoch.toString(),
      maxSourceBalance: sourceData._maxSourceBalance.toString(),
      epochInterval: Number(sourceData._epochInterval),
    }

    if (setting.policy.source.tokenAddress) {
      await ProxyToken.saveAndGetToken(sourceData._vaultToken, network)
    }

    await setting.save()

    logger.info('Updated Setting with source data', llo({ sourceAddress, pluginAddress: setting.pluginAddress }))
  },

  /**
   * Handle PluginDefined event from StreamBalanceSource
   * Event: PluginDefined(address plugin)
   */
  pluginDefined: async (event: LogDescription, info: ILogInfo) => {
    const sourceAddress = info.address
    const pluginAddress = event.args.plugin
    const network = info.network

    const setting = await Models.Setting.findByPolicySourceAddress(sourceAddress, network)

    if (!setting) {
      logger.warn('No Setting found for source address on PluginDefined', llo({ sourceAddress, network }))
      return
    }

    if (setting.pluginAddress !== pluginAddress) {
      logger.error(
        'PluginDefined plugin address mismatch',
        llo({ sourceAddress, pluginAddress, settingPluginAddress: setting.pluginAddress }),
      )
    }
  },

  /**
   * Handle ModelSettingsUpdated event from RatioModel
   * Event: ModelSettingsUpdated(address[] recipientList, uint32[] ratioList)
   */
  ratioModelSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const modelAddress = info.address
    const network = info.network
    const recipients = event.args.recipientList as string[]
    const ratios = (event.args.ratioList as bigint[]).map(r => Number(r))

    const setting = await Models.Setting.findByPolicyModelAddress(modelAddress, network)

    if (!setting) {
      logger.warn('No Setting found for model address', llo({ modelAddress, network }))
      return
    }

    setting.policy.model = {
      ...setting.policy.model,
      recipients,
      ratios,
    }

    await setting.save()

    logger.info('Updated Setting with RatioModel data', llo({ modelAddress, pluginAddress: setting.pluginAddress }))
  },

  /**
   * Handle ModelSettingsUpdated event from EqualRatioModel
   * Event: ModelSettingsUpdated(address[] recipientList)
   */
  equalRatioModelSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const modelAddress = info.address
    const network = info.network
    const recipients = event.args.recipientList as string[]

    const setting = await Models.Setting.findByPolicyModelAddress(modelAddress, network)

    if (!setting) {
      logger.warn('No Setting found for model address', llo({ modelAddress, network }))
      return
    }

    setting.policy.model = {
      ...setting.policy.model,
      recipients,
    }

    await setting.save()

    logger.info(
      'Updated Setting with EqualRatioModel data',
      llo({ modelAddress, pluginAddress: setting.pluginAddress }),
    )
  },

  /**
   * Handle ModelSettingsUpdated event from AddressGaugeRatioModel / TokenGaugeRatioModel
   * Event: ModelSettingsUpdated(IAddressGaugeVoter gaugeVoter) or ModelSettingsUpdated(ITokenGaugeVoter gaugeVoter)
   */
  gaugeModelSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const modelAddress = info.address
    const network = info.network
    const gaugeVoterAddress = event.args.gaugeVoter as HexAddress

    const setting = await Models.Setting.findByPolicyModelAddress(modelAddress, network)

    if (!setting) {
      logger.warn('No Setting found for model address', llo({ modelAddress, network }))
      return
    }

    setting.policy.model = {
      ...setting.policy.model,
      gaugeVoterAddress,
    }

    await setting.save()

    logger.info('Updated Setting with GaugeModel data', llo({ modelAddress, pluginAddress: setting.pluginAddress }))
  },

  /**
   * Handle ModelSettingsUpdated event from BracketsModel
   * Event: ModelSettingsUpdated(Bracket[] brackets)
   */
  bracketsModelSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const modelAddress = info.address
    const network = info.network
    const brackets = event.args.brackets as Array<{
      threshold: bigint
      routerModel: string
      claimerModel: string
    }>

    const formattedBrackets = brackets.map(b => ({
      threshold: b.threshold.toString(),
      routerModelAddress: b.routerModel,
      claimerModelAddress: b.claimerModel,
    }))

    const setting = await Models.Setting.findByPolicyModelAddress(modelAddress, network)

    if (!setting) {
      logger.warn('No Setting found for model address', llo({ modelAddress, network }))
      return
    }

    setting.policy.model = {
      ...setting.policy.model,
      brackets: formattedBrackets,
    }

    await setting.save()

    logger.info('Updated Setting with BracketsModel data', llo({ modelAddress, pluginAddress: setting.pluginAddress }))
  },

  /**
   * Handle RouterSettingsUpdated event from RouterPlugin
   * Event: RouterSettingsUpdated(IRouterModel routerModel)
   * Updates the model address in policy settings
   */
  routerSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const network = info.network
    const modelAddress = event.args.routerModel as HexAddress

    const setting = await Models.Setting.findActive({ pluginAddress, network })

    if (!setting?.policy) {
      logger.warn('No Setting found for plugin address', llo({ pluginAddress, network, info }))
      return
    }

    // Update model address - model data will be populated by model events
    if (!setting.policy.model) {
      setting.policy.model = {
        address: modelAddress,
        type: null as any,
        recipients: [],
        ratios: [],
        gaugeVoterAddress: null,
        brackets: [],
      }
    } else {
      setting.policy.model.address = modelAddress
    }

    await setting.save()

    logger.info('Updated Setting with router model', llo({ pluginAddress, modelAddress }))
  },

  /**
   * Handle ClaimerSettingsUpdated event from ClaimerPlugin
   * Event: ClaimerSettingsUpdated(IClaimerModel _claimerModel)
   * Updates the model address in policy settings
   */
  claimerSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const network = info.network
    const modelAddress = event.args._claimerModel as HexAddress

    const setting = await Models.Setting.findActive({ pluginAddress, network })

    if (!setting?.policy) {
      logger.warn('No Setting found for plugin address', llo({ pluginAddress, network, info }))
      return
    }

    // Update model address - model data will be populated by model events
    if (!setting.policy.model) {
      setting.policy.model = {
        address: modelAddress,
        type: null as any,
        recipients: [],
        ratios: [],
        gaugeVoterAddress: null,
        brackets: [],
      }
    } else {
      setting.policy.model.address = modelAddress
    }

    await setting.save()

    logger.info('Updated Setting with claimer model', llo({ pluginAddress, modelAddress }))
  },

  /**
   * Handle RouterSettingsUpdated event from MultiRouterPlugin / MultiDispatchPlugin
   * Event: RouterSettingsUpdated(RouterPluginBase[] subrouters)
   * Updates the subRouters array in policy settings
   */
  multiRouterSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const network = info.network
    const subRouters = event.args.subrouters as string[]

    const setting = await Models.Setting.findActive({ pluginAddress, network })

    if (!setting?.policy) {
      logger.warn('No Setting found for plugin address', llo({ pluginAddress, network, info }))
      return
    }

    setting.policy.subRouters = subRouters.length > 0 ? subRouters : null

    await setting.save()

    logger.info('Updated Setting with subRouters', llo({ pluginAddress, subRouters }))
  },

  /**
   * Handle ClaimerSettingsUpdated event from MultiClaimerPlugin
   * Event: ClaimerSettingsUpdated(ClaimerPluginBase[] subclaimers)
   * Updates the subClaimers array in policy settings
   */
  multiClaimerSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const network = info.network
    const subClaimers = event.args.subclaimers as string[]

    const setting = await Models.Setting.findActive({ pluginAddress, network })

    if (!setting?.policy) {
      logger.warn('No Setting found for plugin address', llo({ pluginAddress, network, info }))
      return
    }

    setting.policy.subClaimers = subClaimers.length > 0 ? subClaimers : null

    await setting.save()

    logger.info('Updated Setting with subClaimers', llo({ pluginAddress, subClaimers }))
  },

  /**
   * Handle RouterSettingsUpdated event from CowSwapRouterPlugin
   * Event: RouterSettingsUpdated(IERC20 targetToken, IGPv2Settlement cowSwapSettlement, address cowSwapRelayer)
   * Updates the swap settings in policy
   */
  cowSwapRouterSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const network = info.network
    const targetToken = event.args.targetToken as HexAddress
    const cowSwapSettlement = event.args.cowSwapSettlement as HexAddress
    const cowSwapRelayer = event.args.cowSwapRelayer as HexAddress

    const setting = await Models.Setting.findActive({ pluginAddress, network })

    if (!setting?.policy) {
      logger.warn('No Setting found for plugin address', llo({ pluginAddress, network, info }))
      return
    }

    setting.policy.swap = {
      ...setting.policy.swap,
      targetTokenAddress: targetToken,
      cowSwapSettlement,
      cowSwapRelayer,
    }

    if (targetToken) {
      await ProxyToken.saveAndGetToken(targetToken, network)
    }

    await setting.save()

    logger.info('Updated Setting with CowSwap router settings', llo({ pluginAddress, targetToken, cowSwapSettlement }))
  },

  /**
   * Handle RouterSettingsUpdated event from UniswapRouterPlugin
   * Event: RouterSettingsUpdated(ISwapRouter02 uniswapRouter)
   * Updates the swap settings in policy
   */
  uniswapRouterSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const network = info.network
    const uniswapRouter = event.args.uniswapRouter as HexAddress

    const setting = await Models.Setting.findActive({ pluginAddress, network })

    if (!setting?.policy) {
      logger.warn('No Setting found for plugin address', llo({ pluginAddress, network, info }))
      return
    }

    const targetToken = await PolicyHelper.getUniswapTargetToken(pluginAddress, network)

    setting.policy.swap = {
      ...setting.policy.swap,
      uniswapRouter,
      targetTokenAddress: targetToken,
    }

    if (targetToken) {
      await ProxyToken.saveAndGetToken(targetToken, network)
    }

    await setting.save()

    logger.info('Updated Setting with Uniswap router settings', llo({ pluginAddress, uniswapRouter, targetToken }))
  },

  // ==========================================
  // Factory Deployment Event Handlers
  // ==========================================

  /**
   * Generic handler for factory deployment events
   * Creates a LogPolicy record for audit logging
   */
  _handleFactoryDeployment: async (
    event: LogDescription,
    info: ILogInfo,
    eventType: IEventLogPolicyType,
    addressField: string,
  ) => {
    const { transactionHash, transactionIndex, logIndex, blockNumber, network } = info
    const deployedAddress = event.args[addressField] as HexAddress

    try {
      await Models.LogPolicy.create({
        event: eventType,
        transactionHash,
        transactionIndex,
        logIndex,
        blockNumber,
        address: deployedAddress,
        network,
      })

      logger.info('LogPolicy created for factory deployment', llo({ eventType, deployedAddress, network, blockNumber }))
    } catch (error: any) {
      if (error.code === 11000) {
        logger.verbose('LogPolicy already exists', llo({ eventType, deployedAddress }))
      } else {
        logger.error('Failed to create LogPolicy', llo({ error, eventType, deployedAddress }))
      }
    }
  },

  // Source Factory Handlers
  drainBalanceSourceDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.DrainBalanceSourceDeployed,
      'newContract',
    )
  },

  requiredBalanceSourceDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.RequiredBalanceSourceDeployed,
      'newContract',
    )
  },

  streamBalanceSourceDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.StreamBalanceSourceDeployed,
      'newContract',
    )
  },

  fixedBalanceSourceDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.FixedBalanceSourceDeployed,
      'newContract',
    )
  },

  // Model Factory Handlers
  ratioModelDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(event, info, IEventLogPolicyType.RatioModelDeployed, 'newContract')
  },

  equalRatioModelDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.EqualRatioModelDeployed,
      'newContract',
    )
  },

  bracketsModelDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(event, info, IEventLogPolicyType.BracketsModelDeployed, 'newContract')
  },

  addressGaugeRatioModelDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.AddressGaugeRatioModelDeployed,
      'newContract',
    )
  },

  tokenGaugeRatioModelDeployed: async (event: LogDescription, info: ILogInfo) => {
    await PolicyHandler._handleFactoryDeployment(
      event,
      info,
      IEventLogPolicyType.TokenGaugeRatioModelDeployed,
      'newContract',
    )
  },
}
