import logger from '@logger'
import { Interface } from 'ethers'
import Network from '@models/schema/network'
import { DAORegistry } from '@artifacts/daoRegistry'
import config from '@config'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoLogs' })

export const DaoLogs = {
  networksMap: {
    mainnet: 'MAINNET',
    sepolia: 'SEPOLIA',
    polygon: 'POLYGON',
    base: 'BASE',
    arbitrum: 'ARBITRUM',
  },

  _parseNetwork: (network: string) => {
    return DaoLogs.networksMap[network]
  },

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start DaoLogs', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const networkConfigKey = DaoLogs._parseNetwork(networkName as NetworksEnum)
      const daoRegistryInterface = new Interface(DAORegistry.abi)
      const daoRegisteredEvent = daoRegistryInterface.getEvent('DAORegistered')!

      const filter = {
        address: config.ARAGON_CONTRACTS[networkConfigKey]['v1.0.0'].DAORegistryProxy.address,
        topics: [daoRegisteredEvent.topicHash],
        fromBlock: networkDb.lastBlockDaoLog,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async txLog => DaoLogs.processDAORegistered(txLog, networkName as NetworksEnum, networkDb),
        onError: async error => DaoLogs.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
    }
    logger.verbose('Finish DaoLogs', llo())
  },

  processDAORegistered: async (txLog: any, network: NetworksEnum, networkDb: Network) => {
    const daoRegistryInterface = new Interface(DAORegistry.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogDao.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      const daoLog = {
        network,
        address: event.args.dao,
        creatorAddress: event.args.creator,
        ens: event.args.subdomain,
        blockNumber: txLog.blockNumber,
        transactionHash: txLog.transactionHash,
      }
      await Models.LogDao.create(daoLog)

      logger.verbose('New DaoLog', llo({ daoLog }))
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error processDAORegistered',
      llo({
        error,
        network,
      }),
    )
  },
}
