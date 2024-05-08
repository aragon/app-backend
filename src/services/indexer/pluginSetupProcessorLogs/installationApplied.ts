import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { IEventLogPluginType, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginLogs:PluginLogsInstallationApplied' })

export const PluginLogsInstallationApplied = {
  createCrawler: (options: any) => new BlockchainLogCrawler(options),

  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start PluginLogsInstallationApplied', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
      const event = daoRegistryInterface.getEvent(IEventLogPluginType.InstallationApplied)!

      const crawler = PluginLogsInstallationApplied.createCrawler({
        network: networkName as NetworksEnum,
        filter: {
          topics: [event.topicHash],
          fromBlock: networkDb.lastBlockPluginInstallationAppliedLog,
          toBlock: 'latest',
        },
        onLog: async (txLog: Log) =>
          PluginLogsInstallationApplied.processInstallationApplied(txLog, networkName as NetworksEnum),
        onError: async (error: any) => PluginLogsInstallationApplied.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })
      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginInstallationAppliedLog')
    }

    logger.verbose('Finish PluginLogsInstallationApplied', llo())
  },

  processInstallationApplied: async (txLog: any, network: NetworksEnum) => {
    const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.InstallationApplied,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.InstallationApplied,
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
        logger.verbose('New PluginLog - InstallationApplied', llo({ pluginLog }))
      })
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error InstallationApplied',
      llo({
        error,
        network,
      }),
    )
  },
}
