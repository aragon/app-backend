import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
// import { PluginSetupProcessorHandler } from '@indexer/handlers/pluginSetupProcessorHandler'
import Web3Helper from '@helpers/web3'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginSetupProcessorHandler } from '@indexer/handlers/pluginSetupProcessorHandler'
import { Interface } from 'ethers'

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const transactionHash = '0x6b9f98e62162db3f8867b05a2c71ba0adc0986ba8fec2bb61b88d1596e0a9954'
    const network = NetworksEnum.ethereumSepolia

    const txReceipt = await Web3Helper.getTransactionReceipt(transactionHash, network)

    const installationPreparingLogs = Web3Helper.findLogsByName(
      txReceipt!,
      'InstallationPrepared',
      PluginSetupProcessor.abi,
    )

    const iFace = new Interface(PluginSetupProcessor.abi)

    const logInfo = Web3Helper.parseLog(installationPreparingLogs[0].txLog, iFace)

    const info = Web3Helper.parseInfoLog(installationPreparingLogs[0].txLog, 'InstallationPrepared', network)

    await PluginSetupProcessorHandler.installationPrepared(logInfo!, info)
  },

  stop: async () => {},
}

export default ToolsManualTrigger
