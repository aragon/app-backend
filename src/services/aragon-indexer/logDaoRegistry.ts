import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { DAORegistry } from '@artifacts/daoRegistry'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { DaoRegistryHandler } from '@services/aragon-indexer/handlers/daoRegistryHandler'
import { UtilsIndexer } from '@models/utils/indexer'
import { ConfigState } from '@state/configState'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDaoRegistry' })

export const LogDaoRegistry = {
  events: ['DAORegistered'],

  start: async () => {
    const networks = Object.values(Network.NETWORKS)
    await Promise.all(
      networks.map(async networkName => {
        logger.verbose('Start LogDaoRegistry', llo({ networkName }))

        const networkDb = await Models.Network.findByName(networkName as NetworksEnum)
        const provider = ConfigState.getInstance().getConfigItem(networkName as NetworksEnum)

        if (!networkDb || !provider) {
          logger.warn('Unsupported Network', llo({ networkName }))
          return
        }

        const eventTopics = DAORegistry.abi
          .filter((item: any) => item.type === 'event' && LogDaoRegistry.events.includes(item.name))
          .map((event: any) => new Interface(DAORegistry.abi).getEvent(event.name)?.topicHash)

        const filter = {
          topics: eventTopics,
          fromBlock: networkDb.lastBlockDaoRegistry,
          toBlock: 'latest',
        }

        const crawler = new BlockchainLogCrawler({
          network: networkName as NetworksEnum,
          filter,
          onLog: async (txLog: Log) => LogDaoRegistry.processLog(txLog, networkName as NetworksEnum),
          onError: async (error: any) => LogDaoRegistry.processError(error, networkName as NetworksEnum),
          stopOnError: true,
        })

        await crawler.crawl()
        await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockDaoRegistry')
        logger.verbose(
          'End LogDaoRegistry',
          llo({ networkName, latestBlockSync: crawler.crawlResult.latestBlockNumber }),
        )
      }),
    )
  },

  processLog: async (txLog: Log, network: NetworksEnum) => {
    const iFace = new Interface(DAORegistry.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) {
      return
    }
    const info = Web3Helper.parseInfoLog(txLog, event.name, network)

    switch (event.name) {
      case 'DAORegistered':
        logger.verbose('DAORegistered', llo(info))
        await DaoRegistryHandler.daoRegistered(event, info)
        break
      default:
        logger.error('Unhandled event', llo(info))
        break
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error LogDaoRegistry',
      llo({
        error,
        network,
      }),
    )
  },
}
