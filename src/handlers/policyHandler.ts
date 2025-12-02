import logger from '@logger'
import type { LogDescription } from 'ethers'
import { type ILogInfo, type HexAddress, IPolicySourceType } from '@types'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'handler:PolicyHandler' })

export const PolicyHandler = {
  /**
   * Handle SourceSettingsUpdated event from StreamBalanceSource
   * Event: SourceSettingsUpdated(address _vault, IERC20 _vaultToken, uint256 _amountPerEpoch, uint256 _maxSourceBalance, uint256 _epochInterval)
   */
  sourceSettingsUpdated: async (event: LogDescription, info: ILogInfo) => {
    const sourceAddress = info.address
    const network = info.network

    logger.info(
      'SourceSettingsUpdated event received',
      llo({
        sourceAddress,
        blockNumber: info.blockNumber,
        txHash: info.transactionHash,
      }),
    )

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
      amountPerEpoch: sourceData._amountPerEpoch,
      maxSourceBalance: sourceData._maxSourceBalance,
      epochInterval: sourceData._epochInterval,
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

    logger.info(
      'PluginDefined event received',
      llo({
        sourceAddress,
        pluginAddress,
        blockNumber: info.blockNumber,
        txHash: info.transactionHash,
      }),
    )

    // Find Setting by source address and verify plugin matches
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

    logger.info(
      'RatioModel ModelSettingsUpdated event received',
      llo({
        modelAddress,
        recipients,
        ratios,
        blockNumber: info.blockNumber,
        txHash: info.transactionHash,
      }),
    )

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

    logger.info(
      'EqualRatioModel ModelSettingsUpdated event received',
      llo({
        modelAddress,
        recipients,
        blockNumber: info.blockNumber,
        txHash: info.transactionHash,
      }),
    )

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

    logger.info(
      'GaugeModel ModelSettingsUpdated event received',
      llo({
        modelAddress,
        gaugeVoterAddress,
        blockNumber: info.blockNumber,
        txHash: info.transactionHash,
      }),
    )

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

    logger.info(
      'BracketsModel ModelSettingsUpdated event received',
      llo({
        modelAddress,
        brackets: formattedBrackets,
        blockNumber: info.blockNumber,
        txHash: info.transactionHash,
      }),
    )

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
}
