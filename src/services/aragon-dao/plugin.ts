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

    return Utils.JSONStringifyCircular(Utils.deepConvertToObject(pluginLog.parsed!.args))
  },
}

export default Plugin
