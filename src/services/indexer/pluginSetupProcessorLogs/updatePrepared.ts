import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { IEventLogPluginType, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import Utils from '@helpers/utils'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginLogs:PluginLogsUpdatePrepared' })

export const PluginLogsUpdatePrepared = {
  createCrawler: (options: any) => new BlockchainLogCrawler(options),

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start PluginLogsUpdatePrepared', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
      const event = daoRegistryInterface.getEvent(IEventLogPluginType.UpdatePrepared)!

      const crawler = PluginLogsUpdatePrepared.createCrawler({
        network: networkName as NetworksEnum,
        filter: {
          topics: [event.topicHash],
          fromBlock: networkDb.lastBlockPluginUpdatePreparedLog,
          toBlock: 'latest',
        },
        onLog: async (txLog: Log) => PluginLogsUpdatePrepared.processUpdatePrepared(txLog, networkName as NetworksEnum),
        onError: async (error: any) => PluginLogsUpdatePrepared.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })
      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginUpdatePreparedLog')
    }

    logger.verbose('Finish PluginLogsUpdatePrepared', llo())
  },

  processUpdatePrepared: async (txLog: any, network: NetworksEnum) => {
    const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UpdatePrepared,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UpdatePrepared,
          network,
          permissions: Utils.parsePermissions(event.args.preparedSetupData.permissions),
          sender: event.args.sender,
          daoAddress: event.args.dao,
          preparedSetupId: event.args.preparedSetupId,
          pluginSetupRepo: event.args.pluginSetupRepo,
          plugin: event.args.setupPayload.plugin,
          release: Number(event.args.versionTag.release),
          build: Number(event.args.versionTag.build),
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New PluginLog - UpdatePrepared', llo({ pluginLog }))
      })
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error UpdatePrepared',
      llo({
        error,
        network,
      }),
    )
  },
}
