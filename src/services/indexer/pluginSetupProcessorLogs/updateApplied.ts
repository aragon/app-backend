import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { IEventLogPluginType, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginLogs:PluginLogsUpdateApplied' })

export const PluginLogsUpdateApplied = {
  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start PluginLogsUpdateApplied', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
      const event = daoRegistryInterface.getEvent(IEventLogPluginType.UpdateApplied)!

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter: {
          topics: [event.topicHash],
          fromBlock: networkDb.lastBlockPluginUpdateAppliedLog,
          toBlock: 'latest',
        },
        onLog: async (txLog: Log) => PluginLogsUpdateApplied.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => PluginLogsUpdateApplied.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })
      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginUpdateAppliedLog')
    }

    logger.verbose('Finish PluginLogsUpdateApplied', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UpdateApplied,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UpdateApplied,
          network,
          daoAddress: event.args.dao,
          preparedSetupId: event.args.preparedSetupId,
          appliedSetupId: event.args.appliedSetupId,
          plugin: event.args.plugin,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New PluginLog - UpdateApplied', llo({ pluginLog }))
      })
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error UpdateApplied',
      llo({
        error,
        network,
      }),
    )
  },
}
