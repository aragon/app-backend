import logger from '@logger'
import {
  IGovernanceErc20Logs,
  type IIndexerConfig,
  ITokenVotingLogs,
  IExitQueueLogs,
  IVotingEscrowIncreasingLogs,
  IVotingEscrowAdapterLogs,
  ITokenType,
} from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import configIndexer from '@indexer/configIndexer'
import type Token from '@models/schema/token'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:LogTokenVoting' })

export const LogTokenVoting = {
  start: async (plugin: Plugin, token: Token, isHistorical?: boolean) => {
    switch (token.type) {
      case ITokenType.escrowAdapter:
        return LogTokenVoting.veGovernance(plugin, token, isHistorical)
      default:
        return LogTokenVoting.erc20Governance(plugin, token, isHistorical)
    }
  },

  veGovernance: async (plugin: Plugin, token: Token, isHistorical?: boolean) => {
    const infoLogs = {
      network: plugin.network,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      tokenAddress: token.address,
    }
    logger.verbose('Start LogTokenVoting veGovernance', llo(infoLogs))

    const configTVLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ITokenVotingLogs).includes(item.event as any),
    )
    const configExitQueueLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IExitQueueLogs).includes(item.event as any),
    )
    const configEscrowILogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IVotingEscrowIncreasingLogs).includes(item.event as any),
    )
    const configEscrowAdapterILogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IVotingEscrowAdapterLogs).includes(item.event as any),
    )

    const pluginCrawler = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configTVLogs],
      address: [plugin.address],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })

    const veGovernanceCrawler = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configEscrowAdapterILogs, ...configEscrowILogs, ...configExitQueueLogs],
      address: [
        plugin.tokenAddress,
        plugin.votingEscrow?.escrowAddress!,
        plugin.votingEscrow?.exitQueueAddress!,
      ].filter(Boolean),
      fromBlock: token.blockNumber || plugin.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.token(
        ITokenType.escrowAdapter,
        plugin.network,
        plugin.votingEscrow?.escrowAddress!,
      ),
      stopOnError: true,
    })

    logger.verbose('Start Token Sync', llo({ ...infoLogs, ...{ syncStrategy: 'BlockchainLogCrawler' } }))

    const crawlers: any = [pluginCrawler, veGovernanceCrawler]

    const startTime = Date.now()
    await Promise.all(crawlers.map(async (crawler: BlockchainLogCrawler) => crawler.crawl()))
    await Promise.all(crawlers.map(async (crawler: BlockchainLogCrawler) => crawler.end()))

    logger.verbose(
      'End LogTokenVoting veGovernance',
      llo({
        ...infoLogs,
        syncStrategy: 'BlockchainLogCrawler',
        startTime,
        endTime: Date.now(),
        lastPluginSyncBlock: pluginCrawler.crawlSetting.lastSync,
      }),
    )
  },

  erc20Governance: async (plugin: Plugin, token: Token, isHistorical?: boolean) => {
    const infoLogs = {
      network: plugin.network,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      tokenAddress: token?.address,
    }
    logger.verbose('Start LogTokenVoting', llo(infoLogs))

    const configTVLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(ITokenVotingLogs).includes(item.event as any),
    )
    const configGovLogs = configIndexer
      .filter((item: IIndexerConfig) => Object.values(IGovernanceErc20Logs).includes(item.event as any))
      .map((item: IIndexerConfig) => {
        // Override the handler for DelegateVotesChanged to use batch handler
        if (item.event === IGovernanceErc20Logs.DelegateVotesChanged) {
          return {
            ...item,
            config: item.config.map(cfg => ({
              ...cfg,
              handler: GovernanceErc20Handler.delegateVotesChangedBatch,
            })),
          }
        }
        return item
      })

    const pluginCrawler = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configTVLogs],
      address: [plugin.address],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      stopOnError: true,
    })
    const startTime = Date.now()

    logger.verbose('Start Token Sync', llo({ ...infoLogs, ...{ syncStrategy: 'BlockchainLogCrawler', startTime } }))

    const tokenCrawler = new BlockchainLogCrawler({
      parallel: {
        enable: true,
        autoScale: true,
        useBatch: true,
        batchSize: 1000,
      },
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configGovLogs],
      address: [plugin.tokenAddress],
      fromBlock: token?.blockNumber || plugin?.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      stopOnError: true,
      filterLogs: async (logs: any[]) => {
        // Since tokenCrawler only fetches DelegateVotesChanged events, all logs are DelegateVotesChanged
        // Filter out duplicate events keeping only the highest block number per delegate

        if (logs.length === 0) {
          return logs
        }

        // Always use the most optimized approach: Sort + Set
        // O(n log n) for sort + O(n) for filtering = most efficient
        logs.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))

        const seen = new Set<string>()
        const filtered: any = []

        for (let i = 0; i < logs.length; i++) {
          const delegateAddress = logs[i].topics[1]
          if (!seen.has(delegateAddress)) {
            seen.add(delegateAddress)
            filtered.push(logs[i])
          }
        }

        logger.verbose(
          'Filtered DelegateVotesChanged logs',
          llo({
            totalLogs: logs.length,
            filteredLogs: filtered.length,
            duplicatesRemoved: logs.length - filtered.length,
          }),
        )

        return filtered
      },
    })

    const crawlers: any = [pluginCrawler, tokenCrawler]
    await Promise.all(crawlers.map(async (c: BlockchainLogCrawler) => c.crawl()))
    await Promise.all(crawlers.map(async (c: BlockchainLogCrawler) => c.end?.()))

    logger.verbose(
      'End LogTokenVoting',
      llo({
        ...infoLogs,
        syncStrategy: 'BlockchainLogCrawler',
        lastTokenSyncBlock: tokenCrawler.crawlSetting.lastSync,
        lastPluginSyncBlock: pluginCrawler.crawlSetting.lastSync,
        startTime,
        endTime: Date.now(),
      }),
    )
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
