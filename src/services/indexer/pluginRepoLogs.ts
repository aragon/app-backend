import logger from '@logger'
import { Interface, type Log } from 'ethers'
import Network from '@models/schema/network'
import { Models } from '@dbModels'
import { type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginRepoLogs' })

// AddresslistVotingRepoProxy - 0xC207767d8A7a28019AFFAEAe6698F84B5526EbD7 - address-list-voting-repo
// TokenVotingRepoProxy - 0xb7401cD221ceAFC54093168B814Cc3d42579287f - token-voting-repo
// AdminRepoProxy - 0xA4371a239D08bfBA6E8894eccf8466C6323A52C3 - admin-repo
// MultisigRepoProxy - 0x8c278e37D0817210E18A7958524b7D0a1fAA6F7b - multisig-repo

export const PluginRepoLogs = {
  start: async () => {
    for (const networkName of Object.values(Network.NETWORKS)) {
      logger.verbose('Start PluginRepoLogs', llo({ networkName }))

      const networkDb = await Models.Network.findByName(networkName as NetworksEnum)

      if (!networkDb) {
        logger.verbose('Unsupported Network', llo({ networkName }))
        return
      }

      const pluginRepoInterface = new Interface(PluginRepoRegistry.abi)
      const pluginRepoRegisteredEvent = pluginRepoInterface.getEvent('PluginRepoRegistered')!

      const crawler = new BlockchainLogCrawler({
        network: networkName as NetworksEnum,
        filter: {
          topics: [pluginRepoRegisteredEvent.topicHash],
          fromBlock: networkDb.lastBlockPluginRepoLog,
          toBlock: 'latest',
        },
        onLog: async (txLog: Log) => PluginRepoLogs.processLog(txLog, networkName as NetworksEnum),
        onError: async (error: any) => PluginRepoLogs.processError(error, networkName as NetworksEnum),
        stopOnError: true,
      })
      await crawler.crawl()
      await UtilsIndexer.saveSync(crawler, networkDb, 'lastBlockPluginRepoLog')
    }
    logger.verbose('Finish PluginRepoLogs', llo())
  },

  processLog: async (txLog: any, network: NetworksEnum) => {
    const daoRegistryInterface = new Interface(PluginRepoRegistry.abi)
    const event = daoRegistryInterface.parseLog(txLog)!

    const existingLog = await Models.LogPluginRepo.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginRepoLog = {
          network,
          subdomain: event.args.subdomain,
          pluginRepo: event.args.pluginRepo,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginRepo.create(pluginRepoLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New PluginRepoLog', llo({ pluginRepoLog }))
      })
    }
  },

  processError: async (error: any, network: NetworksEnum) => {
    logger.error(
      'Error PluginRepoRegistered',
      llo({
        error,
        network,
      }),
    )
  },
}
