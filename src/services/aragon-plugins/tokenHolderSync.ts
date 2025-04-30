import logger from '@logger'
import { IGovernanceErc20Logs, type IIndexerConfig } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import type Token from '@models/schema/token'
import configIndexer from '@indexer/configIndexer'
import BlockScoutHelper from '@helpers/blockScout'
import config from '@config'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-plugins:tokenHolderSync' })

export const TokenHolderSync = {
  isOptimizedFlowNeeded: async (token: Token, plugin: Plugin) => {
    const service = token?.address
      ? `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token.address}`
      : `${plugin.interfaceType}-${plugin.network}-${plugin.address}}`

    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network: plugin.network,
      service,
    })

    if (existingConfig) {
      return false
    }

    const isCustomToken = token?.blockNumber !== 0 && token.blockNumber < plugin?.blockNumber

    if (!isCustomToken) {
      return false
    }

    try {
      const tokenStats = await BlockScoutHelper.getTokenCounters(plugin.tokenAddress, plugin.network)
      const holderCount = parseInt(tokenStats.holders, 10) || 0
      const holderThreshold = config.CRAWLER_CONFIG.TOKEN_HOLDERS_THRESHOLD

      if (holderCount >= holderThreshold) {
        logger.verbose(
          'TokenHolderSync - Optimized flow needed',
          llo({
            network: plugin.network,
            tokenAddress: plugin.tokenAddress,
            holderCount,
            transferCount: tokenStats.transfers,
            threshold: holderThreshold,
          }),
        )
        return true
      }

      return false
    } catch (error) {
      logger.error(
        'TokenHolderSync - Error checking optimized flow',
        llo({
          error,
          network: plugin.network,
          tokenAddress: plugin.tokenAddress,
        }),
      )
    }
    return false
  },

  _getGovernanceLogConfigsByName: (governanceLogTopic: IGovernanceErc20Logs) => {
    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    return configGovLogs.filter((item: IIndexerConfig) => item.event === governanceLogTopic)
  },

  syncHoldersFromBlockScout: async (plugin: Plugin, token: Token) => {
    await BlockScoutHelper.getAllTokenHolders(
      token.address,
      token.network,
      { pageSize: 100, maxPages: 1000, delayMs: 500 },
      async holder => {
        const member = await ProxyMember.createMember(holder.address)

        const memberBalanceDb = await ProxyMember.getBalances({
          address: holder.address,
          tokenAddress: token.address,
          network: token.network,
        })

        if (!(member && memberBalanceDb)) return

        await DbTx.executeTxFn(async ({ session }) => {
          await memberBalanceDb?.increaseBalance(
            {
              amount: holder.value.toString(),
              blockNumber: plugin.blockNumber,
            },
            { session },
          )
        })

        await ProxyMember.addToDao({
          memberAddress: holder.address,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          tokenAddress: plugin.tokenAddress,
          network: plugin.network,
        })
      },
    )
  },

  syncDelegationEvents: async (plugin: Plugin, token: Token) => {
    const configDelegationOnly = TokenHolderSync._getGovernanceLogConfigsByName(
      IGovernanceErc20Logs.DelegateVotesChanged,
    )

    const crawlerTokenDelegationOnly = new BlockchainLogCrawler({
      onlyHistorical: true,
      network: token.network,
      events: [...configDelegationOnly],
      address: [token.address],
      fromBlock: token?.blockNumber, // Start from token creation to get all delegation history
      onError: async (error: any, log: any) => {
        logger.error(
          'Error TokenHolderSync - Delegation',
          llo({
            log,
            error,
            plugin,
          }),
        )
      },
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}-delegation-only`,
      stopOnError: true,
    })

    await crawlerTokenDelegationOnly.crawl()
  },

  syncTransfersEvents: async (plugin: Plugin, token: Token) => {
    const configTransferOnly = TokenHolderSync._getGovernanceLogConfigsByName(IGovernanceErc20Logs.Transfer)

    const crawlerTokenTransfers = new BlockchainLogCrawler({
      onlyHistorical: true,
      network: plugin.network,
      events: [...configTransferOnly],
      address: [plugin.tokenAddress],
      fromBlock: plugin?.blockNumber, // Only from plugin creation, not token creation
      onError: async (error: any, log: any) => {
        logger.error(
          'Error TokenHolderSync - Transfers',
          llo({
            log,
            error,
            plugin,
          }),
        )
      },
      logService: `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}-transfers-only`,
      stopOnError: true,
    })

    await crawlerTokenTransfers.crawl()
  },
}
