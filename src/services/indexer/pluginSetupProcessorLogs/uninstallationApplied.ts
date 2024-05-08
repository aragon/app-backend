import logger from '@logger'
import { Interface } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { IEventLogPluginType, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginLogs:PluginLogsUninstallationApplied' })

export const PluginLogsUninstallationApplied = {
  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start PluginLogsUninstallationApplied', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
      const event = daoRegistryInterface.getEvent(IEventLogPluginType.UninstallationApplied)!

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter: {
          topics: [event.topicHash],
          fromBlock: networkDb.lastBlockPluginInstallationAppliedLog,
          toBlock: 'latest',
        },
        onLog: async txLog =>
          PluginLogsUninstallationApplied.processUninstallationApplied(txLog, networkName as NetworksEnum, networkDb),
        onError: async error => PluginLogsUninstallationApplied.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })
      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginUninstallationAppliedLog')
    }

    logger.verbose('Finish PluginLogsUninstallationApplied', llo())
  },

  processUninstallationApplied: async (txLog: any, network: NetworksEnum, networkDb: Network) => {
    const daoRegistryInterface = new Interface(PluginSetupProcessor.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.UninstallationApplied,
    )

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginLog = {
          event: IEventLogPluginType.UninstallationApplied,
          network,
          daoAddress: event.args.dao,
          preparedSetupId: event.args.preparedSetupId,
          plugin: event.args.plugin,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginSetupProcessor.create(pluginLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New PluginLog - UninstallationApplied', llo({ pluginLog }))
      })
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error UninstallationApplied',
      llo({
        error,
        network,
      }),
    )
  },
}
