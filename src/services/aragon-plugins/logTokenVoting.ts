import logger from '@logger'
import { IGovernanceErc20Logs, type IIndexerConfig, ITokenVotingLogs } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import type Token from '@models/schema/token'
import { TokenHolderSync } from './tokenHolderSync'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  start: async (plugin: Plugin, token: Token, isHistorical?: boolean) => {
    logger.verbose('Start LogTokenVoting', llo({ network: plugin.network, pluginAddress: plugin.address }))

    const configTVLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ITokenVotingLogs).includes(item.event as any),
    )
    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    const pluginCrawler = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configTVLogs],
      address: [plugin.address],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })

    const optimizedFlowNeeded = await TokenHolderSync.isOptimizedFlowNeeded(token, plugin)
    if (!optimizedFlowNeeded) {
      const tokenCrawler = new BlockchainLogCrawler({
        onlyHistorical: isHistorical,
        network: plugin.network,
        events: [...configGovLogs],
        address: [plugin.tokenAddress],
        fromBlock: token?.blockNumber || plugin?.blockNumber,
        onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
        logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}`,
        stopOnError: true,
      })

      await Promise.all([pluginCrawler.crawl(), tokenCrawler.crawl()])
      logger.verbose(
        'End LogTokenVoting',
        llo({
          network: plugin.network,
          pluginAddress: plugin.address,
          tokenAddress: token?.address,
          lastTokenSyncBlock: tokenCrawler.crawlSetting.lastSync,
          lastPluginSyncBlock: pluginCrawler.crawlSetting.lastSync,
        }),
      )
      return
    }

    await TokenHolderSync.syncHoldersFromBlockScout(plugin, token)

    await Promise.all([
      pluginCrawler.crawl(),
      TokenHolderSync.syncDelegationEvents(plugin, token),
      TokenHolderSync.syncTransfersEvents(plugin, token),
    ])
  },

  processError: async (error: any, plugin: Plugin, log: any) => {
    logger.error(
      'Error LogTokenVoting',
      llo({
        log,
        error,
        plugin,
      }),
    )
  },
}
