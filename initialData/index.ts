import config from '@config'
import { StatusNetworkEnum } from '@types'
import { Models } from '@dbModels'

export const InitialData = {
  start: async () => {
    const networks = config.BLOCKCHAIN_NODES
    await Promise.all(
      Object.entries(networks).map(async ([network, nodeUrl]) => {
        if (nodeUrl) {
          await Models.Network.create({
            name: network.toLowerCase(),
            status: StatusNetworkEnum.healthy,
            isActive: true,
            lastBlockDaoLog: config.ARAGON_CONTRACTS[network]['v1.3.0'].DAORegistryProxy.blockNumber,
            lastBlockMetadataLog: config.ARAGON_CONTRACTS[network]['v1.3.0'].DAORegistryProxy.blockNumber,
            lastBlockPluginRepoLog: config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginRepoRegistryProxy.blockNumber,
            lastBlockPluginInstallationPreparedLog:
              config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginSetupProcessor.blockNumber,
            lastBlockPluginInstallationAppliedLog:
              config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginSetupProcessor.blockNumber,
            lastBlockPluginUninstallationPreparedLog:
              config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginSetupProcessor.blockNumber,
            lastBlockPluginUninstallationAppliedLog:
              config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginSetupProcessor.blockNumber,
            lastBlockPluginUpdatePreparedLog:
              config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginSetupProcessor.blockNumber,
            lastBlockPluginUpdateAppliedLog:
              config.ARAGON_CONTRACTS[network]['v1.3.0'].PluginSetupProcessor.blockNumber,
          })
        }
      }),
    )
  },
}
