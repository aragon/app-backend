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
            config.ARAGON_CONTRACTS[network]['v1.0.0'] ?? config.ARAGON_CONTRACTS[network]['v1.3.0']

          await Models.Network.create({
            name: network.toLowerCase(),
            status: StatusNetworkEnum.healthy,
            isActive: true,
            lastBlockDao: contractConfig.DAOFactory.blockNumber,
            lastBlockDaoRegistry: contractConfig.DAOFactory.blockNumber,
            lastBlockPluginRepoRegistry: contractConfig.DAOFactory.blockNumber,
            lastBlockPluginSetupProcessor: contractConfig.DAOFactory.blockNumber,
            lastBlockProposal: contractConfig.DAOFactory.blockNumber,
            lastBlockPluginSetting: contractConfig.DAOFactory.blockNumber,
          })
        }
      }),
    )
  },
}
