import logger from '@logger'
import { IGovernanceErc20Logs, type IIndexerConfig, ITokenSyncTagName } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Plugin from '@models/schema/plugin'
import type Token from '@models/schema/token'
import configIndexer from '@indexer/configIndexer'
import config from '@config'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import ProxyWeb3Provider from '@modules/proxyProvider'
import ConfigIndexerHelper from '@helpers/configIndexer'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-plugins:tokenHolderSync' })

export const TokenHolderSync = {
  isTokenNotEligibleForSync: async (token: Token, plugin: Plugin): Promise<boolean> => {
    try {
      if (!token || !plugin) {
        return false
      }

      if (token.ignoreTransfer) {
        return true
      }

      const isCustomToken = token.blockNumber !== 0 && token.blockNumber < plugin.blockNumber
      if (!isCustomToken) {
        return false
      }

      const defaultTag = await Models.ConfigIndexer.findOne({
        network: plugin.network,
        service: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
      })

      if (defaultTag) {
        return false
      }

      const tokenStats = await ProxyWeb3Provider.getTokenCounters({
        address: plugin.tokenAddress,
        network: plugin.network,
      })

      const holderCount = tokenStats.holders || tokenStats.transfers
      const holderThreshold = config.CRAWLER_CONFIG.TOKEN_HOLDERS_THRESHOLD
      const exceedsThreshold = holderCount >= holderThreshold

      if (exceedsThreshold) {
        logger.warn('Token exceeds holder threshold for full sync', {
          network: plugin.network,
          tokenAddress: plugin.tokenAddress,
          holderCount,
          tokenStats,
        })
      }

      return exceedsThreshold
    } catch (error: any) {
      logger.error('Failed to check token eligibility for full sync', {
        error,
        network: plugin?.network,
        tokenAddress: plugin?.tokenAddress,
        tokenBlockNumber: token?.blockNumber,
      })

      return false
    }
  },

  _getGovernanceLogConfigsByName: (governanceLogTopic: IGovernanceErc20Logs) => {
    const configGovLogs = configIndexer.filter((item: IIndexerConfig) =>
      Object.values(IGovernanceErc20Logs).includes(item.event as any),
    )

    return configGovLogs.filter((item: IIndexerConfig) => item.event === governanceLogTopic)
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
      logService: ConfigIndexerHelper.builders.token(
        token.type,
        token.network,
        token.address,
        ITokenSyncTagName.delegates,
      ),
      stopOnError: true,
    })

    await crawlerTokenDelegationOnly.crawl()
    await crawlerTokenDelegationOnly.end()
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
      logService: ConfigIndexerHelper.builders.token(
        token.type,
        token.network,
        token.address,
        ITokenSyncTagName.transfers,
      ),
      stopOnError: true,
    })

    await crawlerTokenTransfers.crawl()
    await crawlerTokenTransfers.end()
  },

  convertToStandardSync: async (plugin: Plugin, token: Token) => {
    const delegationTagName = ConfigIndexerHelper.builders.token(
      token.type,
      token.network,
      token.address,
      ITokenSyncTagName.delegates,
    )

    const transferTagName = ConfigIndexerHelper.builders.token(
      token.type,
      token.network,
      token.address,
      ITokenSyncTagName.transfers,
    )

    const syncTags = await Models.ConfigIndexer.find({
      network: plugin.network,
      service: {
        $in: [delegationTagName, transferTagName],
      },
    })

    const syncStatBlocks = syncTags.length > 0 ? syncTags.map((tag: any) => tag.lastSync) : [plugin.blockNumber]

    const syncStatBlock = Math.max(...syncStatBlocks)

    await Promise.all([
      Models.ConfigIndexer.deleteMany({
        network: plugin.network,
        service: {
          $in: [delegationTagName, transferTagName],
        },
      }),
      Models.ConfigIndexer.create({
        network: plugin.network,
        service: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
        lastSync: syncStatBlock,
      }),
    ])

    logger.verbose(
      'TokenHolderSync - Converted to standard sync',
      llo({
        network: plugin.network,
        tokenAddress: token.address,
        pluginAddress: plugin.address,
        lastSyncBlock: syncStatBlock,
      }),
    )
  },

  getTokenLastSyncBlock: async (token: Token) => {
    const syncTag = await Models.ConfigIndexer.findOne({
      network: token.network,
      regex: { $regex: `${token.address}$` },
    })

    return syncTag?.lastSync || 0
  },

  linkPluginToExistingTokenHolders: async (plugin: Plugin, token: Token, lastSync: number) => {
    const membersFromToken = await Models.Member.find({
      tokenAddress: token.address,
      network: token.network,
    }).distinct('memberAddress')

    if (membersFromToken.length === 0) return

    const membersDataToSave = membersFromToken.reduce(
      (membersData: any, memberAddress: any) => {
        const daoRelation = {
          id: Models.DaoMemberMapping.getEntityId({
            network: plugin.network,
            memberAddress,
            tokenOrPluginAddress: token.address || plugin.address,
          }),
          memberAddress,
          ...(token.address ? { tokenAddress: token.address } : { pluginAddress: plugin.address }),
          network: plugin.network,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        }
        const memberMetrics = {
          network: plugin.network,
          address: memberAddress,
          pluginAddress: plugin.address,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        }

        membersData.daoRelation.push(daoRelation)
        membersData.metrics.push({
          id: Models.MemberMetrics.getEntityId(memberMetrics),
          ...memberMetrics,
        })

        return membersData
      },
      { daoRelation: [], metrics: [] },
    )

    try {
      await Promise.all([
        Models.DaoMemberMapping.insertMany(membersDataToSave.daoRelation, { ordered: false, lean: true }),
        Models.MemberMetrics.insertMany(membersDataToSave.metrics, { ordered: false, lean: true }),
      ])
      await Models.ConfigIndexer.create({
        network: plugin.network,
        service: ConfigIndexerHelper.builders.token(token.type, token.network, token.address),
        lastSync,
      })
    } catch (e: any) {
      logger.error('Error linking plugin to existing token holders', {
        error: e,
        pluginAddress: plugin.address,
        tokenAddress: token.address,
        network: plugin.network,
      })
    }
  },
}
