import logger from '@logger'
import { type IEnumIndexerServiceStatic, TokenSyncTagName, IGovernanceErc20Logs, type IIndexerConfig } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import type Token from '@models/schema/token'
import configIndexer from '@indexer/configIndexer'
import config from '@config'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import ProxyWeb3Provider from '@modules/proxyProvider'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-plugins:tokenHolderSync' })

export const TokenHolderSync = {
  getTagName: (plugin: Plugin, token: Token, type: TokenSyncTagName): IEnumIndexerServiceStatic => {
    return `${plugin.interfaceType}-${plugin.network}-${plugin.address}-${token?.address}${type === TokenSyncTagName.Default ? '' : `-${type}`}`
  },
  isOptimizedFlowNeeded: async (token: Token, plugin: Plugin) => {
    const isCustomToken = token?.blockNumber !== 0 && token.blockNumber < plugin?.blockNumber

    if (!isCustomToken) {
      return false
    }

    /**
     * After all the sync are done, we basically remove from configIndexer the progress
     * of the sync, (transfers, delegation)
     * Then we create a new entry with the default tag name which we use for normal token voting
     */

    const hasDefaultTag = await Models.ConfigIndexer.findOne({
      network: plugin.network,
      service: TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.Default),
    })

    if (hasDefaultTag) {
      return false
    }

    try {
      const tokenStats = await ProxyWeb3Provider.getTokenCounters({
        address: plugin.tokenAddress,
        network: plugin.network,
      })
      const holderCount = tokenStats.holders
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

  syncAllTokenHolders: async (plugin: Plugin, token: Token) => {
    const blockScoutSyncKey = TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.TokenHolders)

    const existingSync = await Models.ConfigIndexer.findExistingLog({
      network: plugin.network,
      service: blockScoutSyncKey,
    })

    if (existingSync?.end) {
      logger.verbose(
        'TokenHolderSync - BlockScout sync already completed, skipping',
        llo({
          network: plugin.network,
          tokenAddress: token.address,
          pluginAddress: plugin.address,
        }),
      )
      return
    }

    logger.verbose(
      'TokenHolderSync - Starting/Resuming BlockScout sync',
      llo({
        network: plugin.network,
        tokenAddress: token.address,
        pluginAddress: plugin.address,
        lastSync: existingSync?.lastSync || 0,
      }),
    )

    const result = await ProxyWeb3Provider.getAllTokenHolders({
      address: token.address,
      network: token.network,
      syncKey: blockScoutSyncKey,
      callback: async holder => {
        const balanceAmount = holder.value.toString()
        if (balanceAmount === '0') return

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
              amount: balanceAmount,
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
    })

    logger.verbose(
      'TokenHolderSync - Sync completed or suspended',
      llo({
        network: plugin.network,
        tokenAddress: token.address,
        hasMore: result.hasMore,
        lastPage: result.lastPage,
      }),
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
      logService: TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.Delegation),
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
      fromBlock: plugin?.blockNumber,
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
      logService: TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.Transfer),
      stopOnError: true,
    })

    await crawlerTokenTransfers.crawl()
  },

  convertToStandardSync: async (plugin: Plugin, token: Token) => {
    const delegationTagName = TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.Delegation)
    const transferTagName = TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.Transfer)

    await DbTx.executeTxFn(async ({ session }) => {
      const syncTags = await Models.ConfigIndexer.find(
        {
          network: plugin.network,
          service: {
            $in: [delegationTagName, transferTagName],
          },
        },
        { session },
      )

      const syncStatBlocks = syncTags.length > 0 ? syncTags.map((tag: any) => tag.lastSync) : [plugin.blockNumber]

      const syncStatBlock = Math.max(...syncStatBlocks)

      await Models.ConfigIndexer.deleteMany(
        {
          network: plugin.network,
          service: {
            $in: [delegationTagName, transferTagName],
          },
        },
        { session },
      )

      await Models.ConfigIndexer.create(
        {
          network: plugin.network,
          service: TokenHolderSync.getTagName(plugin, token, TokenSyncTagName.Default),
          lastSync: syncStatBlock,
        },
        { session },
      )

      await session.commitTransaction()
      await session.endSession()
    })
  },
}
