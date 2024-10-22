import { EnumConnection, type IService, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
// import { PluginSetupProcessorHandler } from '@indexer/handlers/pluginSetupProcessorHandler'
import Web3Helper from '@helpers/web3'
// import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
// import { PluginSetupProcessorHandler } from '@indexer/handlers/pluginSetupProcessorHandler'
import { Interface } from 'ethers'
import { DAO } from '@artifacts/dao'
import { MetadataHandler } from '@indexer/handlers/metadataHandler'

export const ToolsManualTrigger: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const transactionHash = ''
    const network = NetworksEnum.ethereumSepolia

    const txReceipt = await Web3Helper.getTransactionReceipt(transactionHash, network)

    const installationPreparingLogs = Web3Helper.findLogsByName(txReceipt!, 'MetadataSet', DAO.abi)

    const iFace = new Interface(DAO.abi)

    for (const log of installationPreparingLogs) {
      const logInfo = Web3Helper.parseLog(log.txLog, iFace)

      const info = Web3Helper.parseInfoLog(log.txLog, 'MetadataSet', network)

      await MetadataHandler.metadataSet(logInfo!, info)
    }
  },

  stop: async () => {},
}

export default ToolsManualTrigger
