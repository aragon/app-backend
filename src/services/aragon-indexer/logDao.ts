import logger from '@logger'
import { Interface, type Log } from 'ethers'
import { IEnumIndexerService, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { DaoHandler } from '@services/aragon-indexer/handlers/daoHandler'
import { MetadataHandler } from '@services/aragon-indexer/handlers/metadataHandler'
import { DAO } from '@artifacts/dao'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDao' })

// must run after daoRegistry
export const LogDao = {
  service: '',
  events: ['MetadataSet', 'NewURI'],

  start: async () => {
    await Promise.all(
      NetworkHelper.supportedNetworks().map(async ({ networkName }) => {
        logger.verbose('Start LogDao', llo({ networkName }))

        const eventTopics = DAO.abi
          .filter((item: any) => item.type && LogDao.events.includes(item.name))
          .map((event: any) => new Interface(DAO.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName,
          filter,
          onLog: async (txLog: Log) => LogDao.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogDao.processError(error, networkName as NetworksEnum),
          logService: IEnumIndexerService.daoLog,
          stopOnError: true,
        })

        await crawler.crawl()
        logger.verbose('End LogDao', llo({ networkName, latestBlockSync: crawler.crawlResult.lastSync }))
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
