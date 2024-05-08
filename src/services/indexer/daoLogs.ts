import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { DAORegistry } from '@artifacts/daoRegistry'
import config from '@config'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

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

      const contractConfig =
        config.ARAGON_CONTRACTS[networkConfigKey]['v1.0.0'] || config.ARAGON_CONTRACTS[networkConfigKey]['v1.3.0']
      const filter = {
        address: contractConfig.DAORegistryProxy.address,
        topics: [daoRegisteredEvent.topicHash],
        fromBlock: networkDb.lastBlockDaoLog,
        toBlock: 'latest',
      }

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter,
        onLog: async (txLog: Log) => DaoLogs.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => DaoLogs.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })

      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockDaoLog')
    }
    logger.verbose('Finish DaoLogs', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const daoRegistryInterface = new Interface(DAORegistry.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogDao.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoLog = {
          network,
          address: event.args.dao,
          creatorAddress: event.args.creator,
          ens: event.args.subdomain,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogDao.create(daoLog, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New DaoLog', llo({ daoLog }))
      })
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
