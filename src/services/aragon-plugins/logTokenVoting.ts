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
import { TokenHolderSync } from './tokenHolderSync'
import config from '@config'

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
      tokenAddress: token?.address,
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
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}`,
      stopOnError: true,
    })

    const veGovernanceCrawler = new BlockchainLogCrawler({
      onlyHistorical: isHistorical,
      network: plugin.network,
      events: [...configEscrowAdapterILogs, ...configEscrowILogs, ...configExitQueueLogs],
      address: [plugin.tokenAddress],
      fromBlock: plugin?.blockNumber,
      onError: async (error: any, log: any) => LogTokenVoting.processError(error, plugin, log),
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${plugin.votingEscrow?.escrowAddress}`,
      stopOnError: true,
    })

    logger.verbose('Start Token Sync', llo({ ...infoLogs, ...{ syncStrategy: 'BlockchainLogCrawler' } }))

    const crawlers: any = [pluginCrawler.crawl(), veGovernanceCrawler.crawl()]

    const startTime = Date.now()
    await Promise.all(crawlers)

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
    const startTime = Date.now()

    const isNotEligibleForSync = await TokenHolderSync.isTokenNotEligibleForSync(token, plugin)
    const skipSync = isNotEligibleForSync && config.IGNORE_TRANSFER

    if (skipSync) {
      logger.verbose('Skip sync large token', llo({ ...infoLogs }))
      token.ignoreTransfer = true
      await token.save()
    }

    if (isNotEligibleForSync) {
      logger.verbose('Start Sync Only Delegates Events', llo({ ...infoLogs, skipSync }))

      await Promise.all([pluginCrawler.crawl(), TokenHolderSync.syncDelegationEvents(plugin, token)])

      await TokenHolderSync.convertToStandardSync(plugin, token)

      logger.verbose(
        'End LogTokenVoting',
        llo({
          ...infoLogs,
          syncStrategy: 'BlockScout',
          startTime,
          endTime: Date.now(),
        }),
      )
      return
    }

    logger.verbose('Start Token Sync', llo({ ...infoLogs, ...{ syncStrategy: 'BlockchainLogCrawler' } }))

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

    const crawlers: any = [pluginCrawler.crawl(), tokenCrawler.crawl()]
    await Promise.all(crawlers)

    logger.verbose(
      'End LogTokenVoting',
      llo({
        ...infoLogs,
        syncStrategy: 'BlockchainLogCrawler',
        lastTokenSyncBlock: tokenCrawler.crawlSetting.lastSync,
        lastPluginSyncBlock: pluginCrawler.crawlSetting.lastSync,
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
