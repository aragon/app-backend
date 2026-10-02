import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { Models } from '@dbModels'
import GaugeHelper from '@helpers/gauge'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { type HexAddress, IEventLogPluginType, type NetworksEnum } from '@src/types'

const Plugin = {
  getGaugeEpochId: async (pluginAddress: HexAddress, network: NetworksEnum) => {
    return await GaugeHelper.getGaugeEpochId(pluginAddress, network)
  },

  getInstallationData: async (pluginAddress: HexAddress, network: NetworksEnum) => {
    const [pluginDb, setupLog] = await Promise.all([
      Models.Plugin.findByAddress(pluginAddress, network),
      Plugin._findAppliedSetupLog(pluginAddress, network),
    ])

    if (!pluginDb || !setupLog) {
      return null
    }

    const txReceipt = await Web3Helper.getTransactionReceipt(setupLog.transactionHash, network)
    if (!txReceipt) {
      return null
    }

    const pluginLog = Web3Utils.findLogsByName(txReceipt, setupLog.event, PluginSetupProcessor.abi).find(
      ({ parsed, txLog }) =>
        txLog.index === setupLog.logIndex && parsed?.args.preparedSetupId === setupLog.preparedSetupId,
    )

    if (!pluginLog) {
      return null
    }

    try {
      const rawPluginData = pluginLog.parsed!.args.toObject()
      rawPluginData.versionTag = rawPluginData.versionTag.toArray()
      rawPluginData.preparedSetupData = rawPluginData.preparedSetupData.toObject()
      rawPluginData.preparedSetupData.helpers = rawPluginData.preparedSetupData.helpers.toArray()
      rawPluginData.preparedSetupData.permissions = rawPluginData.preparedSetupData.permissions.toArray()

      if (rawPluginData.setupPayload) {
        rawPluginData.setupPayload = rawPluginData.setupPayload.toObject()
        rawPluginData.setupPayload.currentHelpers = rawPluginData.setupPayload.currentHelpers.toArray()
        rawPluginData.plugin = rawPluginData.setupPayload.plugin
      }

      const serialize = Utils.JSONStringifyCircular(rawPluginData)
      return JSON.parse(serialize)
    } catch (_error: any) {
      return null
    }
  },

  _findAppliedSetupLog: async (pluginAddress: HexAddress, network: NetworksEnum) => {
    const applied = await Models.LogPluginSetupProcessor.findOne({
      pluginAddress,
      network,
      event: { $in: [IEventLogPluginType.InstallationApplied, IEventLogPluginType.UpdateApplied] },
    }).sort({ blockNumber: -1, transactionIndex: -1, logIndex: -1 })

    if (!applied) {
      return Models.LogPluginSetupProcessor.findOne({
        pluginAddress,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      })
    }

    return Models.LogPluginSetupProcessor.findOne({
      pluginAddress,
      network,
      daoAddress: applied.daoAddress,
      preparedSetupId: applied.preparedSetupId,
      event:
        applied.event === IEventLogPluginType.UpdateApplied
          ? IEventLogPluginType.UpdatePrepared
          : IEventLogPluginType.InstallationPrepared,
    })
  },
}

export default Plugin
