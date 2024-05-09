import config from '@config'
import { StatusNetworkEnum } from '@types'
import { Models } from '@dbModels'

export const InitialData = {
  start: async () => {
    const networks = config.BLOCKCHAIN_NODES

    await Promise.all(
      Object.entries(networks).map(async ([network, nodeUrl]) => {
        if (nodeUrl) {
          const contractConfig =
            config.ARAGON_CONTRACTS[network]['v1.3.0'] ?? config.ARAGON_CONTRACTS[network]['v1.0.0']
          await Models.Network.create({
            name: network.toLowerCase(),
            status: StatusNetworkEnum.healthy,
            isActive: true,
            lastBlockDao: contractConfig.DAOBase.blockNumber,
            lastBlockDaoRegistry: contractConfig.DAORegistryProxy.blockNumber,
            lastBlockPluginRepoRegistry: contractConfig.PluginRepoRegistryProxy.blockNumber,
            lastBlockPluginSetupProcessor: contractConfig.PluginSetupProcessor.blockNumber,
          })
        }
      }),
    )
  },
}
