import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { DaoHandler } from '@services/indexer/handlers/daoHandler'
import { MetadataHandler } from '@services/indexer/handlers/metadataHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { DAO } from '@artifacts/dao'
import { ConfigState } from '@state/configState'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDao' })

// must run after daoRegistry
export const LogDao = {
  events: ['MetadataSet', 'NewURI'],

  start: async () => {
    const networks = Object.values(Network.NETWORKS)
    await Promise.all(
      networks.map(async networkName => {
        logger.verbose('Start LogDao', llo({ networkName }))

        const networkDb = await Models.Network.findByName(networkName as NetworksEnum)
        const provider = ConfigState.getInstance().getConfigItem(networkName as NetworksEnum)

        if (!networkDb || !provider) {
          logger.warn('Unsupported Network', llo({ networkName }))
          return
        }

        const eventTopics = DAO.abi
          .filter((item: any) => item.type && LogDao.events.includes(item.name))
          .map((event: any) => new Interface(DAO.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
          fromBlock: networkDb.lastBlockDao,
          toBlock: 'latest',
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName as NetworksEnum,
          filter,
          onLog: async (txLog: Log) => LogDao.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogDao.processError(error, networkName as NetworksEnum),
          stopOnError: true,
        })

        await crawler.crawl()
        await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockDao')
        logger.verbose('End LogDao', llo({ networkName, latestBlockSync: crawler.crawlResult.latestBlockNumber }))
      }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(DAO.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'MetadataSet':
        logger.verbose('MetadataSet', llo(info))
        await MetadataHandler.metadataSet(event, info)
        break
      case 'NewURI':
        logger.verbose('NewURI', llo(info))
        await DaoHandler.newURI(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogDao',
      llo({
        error,
        network,
      }),
    )
  },
}
