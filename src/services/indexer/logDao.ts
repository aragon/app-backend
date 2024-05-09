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

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogDao' })

export const LogDao = {
  events: [
    'CallbackReceived',
    'Deposited',
    'Executed',
    'Granted',
    'MetadataSet',
    'NativeTokenDeposited',
    'NewURI',
    'Revoked',
    'StandardCallbackRegistered',
    'TrustedForwarderSet',
  ],

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start LogDao', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const eventTopics = DAO.abi
        .filter((item: any) => item.type && LogDao.events.includes(item.name))
        .map((event: any) => new Interface(DAO.abi).getEvent(event.name)?.topicHash)

      const filter = {
        topics: eventTopics,
        fromBlock: networkDb.lastBlockDaoLog,
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
    }
    logger.verbose('Finish LogDao', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const event = new Interface(DAO.abi).parseLog(txLog)!

    switch (event.name) {
      case 'CallbackReceived':
        logger.verbose('CallbackReceived', llo({ eventName: event.name }))
        await DaoHandler.callbackReceived(event, txLog, network)
        break
      case 'Deposited':
        logger.verbose('Deposited', llo({ eventName: event.name }))
        await DaoHandler.deposited(event, txLog, network)
        break
      case 'Executed':
        logger.verbose('Executed', llo({ eventName: event.name }))
        await DaoHandler.executed(event, txLog, network)
        break
      case 'Granted':
        logger.verbose('Granted', llo({ eventName: event.name }))
        await DaoHandler.granted(event, txLog, network)
        break
      case 'MetadataSet':
        logger.verbose('MetadataSet', llo({ eventName: event.name }))
        await MetadataHandler.metadataSet(event, txLog, network)
        break
      case 'NativeTokenDeposited':
        logger.verbose('NativeTokenDeposited', llo({ eventName: event.name }))
        await DaoHandler.nativeTokenDeposited(event, txLog, network)
        break
      case 'NewURI':
        logger.verbose('NewURI', llo({ eventName: event.name }))
        await DaoHandler.newURI(event, txLog, network)
        break
      case 'Revoked':
        logger.verbose('Revoked', llo({ eventName: event.name }))
        await DaoHandler.revoked(event, txLog, network)
        break
      case 'StandardCallbackRegistered':
        logger.verbose('StandardCallbackRegistered', llo({ eventName: event.name }))
        await DaoHandler.standardCallbackRegistered(event, txLog, network)
        break
      case 'TrustedForwarderSet':
        logger.verbose('TrustedForwarderSet', llo({ eventName: event.name }))
        await DaoHandler.trustedForwarderSet(event, txLog, network)
        break
      default:
        logger.error('Unhandled event', llo({ event }))
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
