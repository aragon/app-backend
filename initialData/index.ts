import config from '@config'
import {
  AggregatorTypeEnum,
  EnumConnection,
  type HexAddress,
  type IService,
  NetworksEnum,
  StatusNetworkEnum,
} from '@types'
import { TokensList } from './tokens'
import { UtilsIndexer } from '@models/utils/indexer'
import { Models } from '@dbModels'
import dayjs from '@helpers/dayjs'

export const InitialData: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    // Network init data
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
            lastBlockMember: contractConfig.DAOFactory.blockNumber,
          })
        }
      }),
    )

    // Aggregator init data
    await Promise.all(
      Object.values(AggregatorTypeEnum).map(async type => {
        await Models.Aggregator.create({
          type,
          lastTimeSync: dayjs.utc('1970-01-01T00:00:00Z').toDate(),
        })
      }),
    )

    // Tokens init data
    const tokens = TokensList.filter(tk => tk.network === NetworksEnum.mainnet)
    await Promise.all(
      tokens.map(async token => {
        await UtilsIndexer.saveAndGetToken(token.contractAddress as HexAddress, token.network)
      }),
    )
  },

  stop: async () => {},
}

export default InitialData
