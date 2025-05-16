import { type HexAddress, IEventLogPluginType, type NetworksEnum } from '@src/types'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import Utils from '@helpers/utils'

const Plugin = {
  getInstallationData: async (pluginAddress: HexAddress, network: NetworksEnum) => {
    const [pluginDb, installationLog] = await Promise.all([
      Models.Plugin.findByAddress(pluginAddress, network),
      Models.LogPluginSetupProcessor.findOne({
        pluginAddress,
        network,
        event: IEventLogPluginType.InstallationPrepared,
      }),
    ])

    if (!pluginDb || !installationLog) {
      return null
    }

    const txReceipt = await Web3Helper.getTransactionReceipt(installationLog.transactionHash, network)
    if (!txReceipt) {
      return null
    }

    const installationPreparedLog = Web3Utils.findLogsByName(
      txReceipt,
      IEventLogPluginType.InstallationPrepared,
      PluginSetupProcessor.abi,
    )

    const pluginLog = installationPreparedLog.find((parsedLog: any) => {
      return parsedLog.parsed.args.plugin === pluginAddress
    })

    if (!pluginLog) {
      return null
    }

    try {
      const rawPluginData = pluginLog.parsed!.args.toObject()
      rawPluginData.versionTag = rawPluginData.versionTag.toArray()
      rawPluginData.preparedSetupData = rawPluginData.preparedSetupData.toObject()
      rawPluginData.preparedSetupData.helpers = rawPluginData.preparedSetupData.helpers.toArray()
      rawPluginData.preparedSetupData.permissions = rawPluginData.preparedSetupData.permissions.toArray()

      const serialize = Utils.JSONStringifyCircular(rawPluginData)
      return JSON.parse(serialize)
    } catch (_error: any) {
      return null
    }
  },
}

export default Plugin
