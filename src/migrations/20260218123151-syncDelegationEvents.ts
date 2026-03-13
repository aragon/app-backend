import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import GaugeHelper from '@helpers/gauge'
import GovernanceVeHelper from '@helpers/governanceVe'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import configIndexer from '@indexer/configIndexer'
import {
  type IIndexerConfig,
  type ILogInfo,
  type IMigration,
  IPluginInterfaceType,
  ITokenType,
  NetworksEnum,
} from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncDelegationEvents' })

export async function resolveBlockTimestamps(
  events: Array<{ info: ILogInfo }>,
  network: NetworksEnum,
): Promise<Map<number, number>> {
  const uniqueBlocks = [...new Set(events.map(e => e.info.blockNumber))]
  const timestampMap = new Map<number, number>()

  const results = await Web3BatchHelper.callRpcMethod<any>(
    'eth_getBlockByNumber',
    uniqueBlocks.map(blockNumber => ({
      params: [`0x${blockNumber.toString(16)}`, false],
      identifier: blockNumber,
    })),
    network,
  )

  for (const result of results) {
    if (result.success && result.data?.timestamp) {
      timestampMap.set(result.identifier as number, parseInt(result.data.timestamp, 16))
    } else {
      timestampMap.set(result.identifier as number, 0)
    }
  }

  return timestampMap
}

export async function delegateTokensBatch(events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) {
  if (events.length === 0) return
  const timestampMap = await resolveBlockTimestamps(events, events[0].info.network)

  const ops = events.map(({ parsedEvent, info }) => {
    const doc = {
      id: Models.TokenDelegation.getEntityId({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      }),
      network: info.network,
      contractAddress: info.address,
      delegator: parsedEvent.args.sender,
      delegate: parsedEvent.args.delegatee,
      tokenIds: parsedEvent.args.tokenIds.map((t: any) => t.toString()),
      action: 'delegate' as const,
      blockNumber: info.blockNumber,
      blockTimestamp: timestampMap.get(info.blockNumber) ?? 0,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    }
    return { updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } }
  })

  await Models.TokenDelegation.bulkWrite(ops, { ordered: false })
}

export async function unDelegateTokensBatch(events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) {
  if (events.length === 0) return
  const timestampMap = await resolveBlockTimestamps(events, events[0].info.network)

  const ops = events.map(({ parsedEvent, info }) => {
    const doc = {
      id: Models.TokenDelegation.getEntityId({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      }),
      network: info.network,
      contractAddress: info.address,
      delegator: parsedEvent.args.sender,
      delegate: parsedEvent.args.delegatee,
      tokenIds: parsedEvent.args.tokenIds.map((t: any) => t.toString()),
      action: 'undelegate' as const,
      blockNumber: info.blockNumber,
      blockTimestamp: timestampMap.get(info.blockNumber) ?? 0,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    }
    return { updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } }
  })

  await Models.TokenDelegation.bulkWrite(ops, { ordered: false })
}

export async function delegateChangedBatch(events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) {
  if (events.length === 0) return
  const timestampMap = await resolveBlockTimestamps(events, events[0].info.network)

  const ops = events.map(({ parsedEvent, info }) => {
    const doc = {
      id: Models.LogDelegateChanged.getEntityId({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      }),
      tokenAddress: info.address,
      network: info.network,
      delegator: parsedEvent.args.delegator,
      fromDelegate: parsedEvent.args.fromDelegate,
      toDelegate: parsedEvent.args.toDelegate,
      blockNumber: info.blockNumber,
      blockTimestamp: timestampMap.get(info.blockNumber) ?? 0,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    }
    return { updateOne: { filter: { id: doc.id }, update: { $setOnInsert: doc }, upsert: true } }
  })

  await Models.LogDelegateChanged.bulkWrite(ops, { ordered: false })
}

export const syncDelegationEventsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260218123151-syncDelegationEvents' }))

    try {
      const plugins = await Models.Plugin.find({
        interfaceType: IPluginInterfaceType.gauge,
        address: '0x0ed1CE77DEc07d8EFa6dbB8b8C68aC7442EA7db6',
        network: NetworksEnum.katanaMainnet,
      })

      if (plugins.length === 0) {
        logger.info('No gauge plugins found', llo({}))
        return
      }

      for (const plugin of plugins) {
        const pluginAddress = plugin.address
        const network = plugin.network as NetworksEnum
        const fromBlock = plugin.blockNumber

        logger.info('Processing gauge plugin', llo({ pluginAddress, network, fromBlock }))

        const escrowAddress = await GovernanceVeHelper.getEscrowAddress(pluginAddress, network)
        if (!escrowAddress) {
          logger.warn('No escrow address found, skipping', llo({ pluginAddress }))
          continue
        }

        const adapterAddress = await GaugeHelper.getIVotesAdapterAddress(escrowAddress, network)
        if (!adapterAddress) {
          logger.warn('No adapter address found, skipping', llo({ pluginAddress }))
          continue
        }

        logger.info('Resolved addresses', llo({ pluginAddress, escrowAddress, adapterAddress }))

        const deletedTokenDelegation = await Models.TokenDelegation.deleteMany({
          contractAddress: adapterAddress,
          network,
        })
        const deletedLogDelegateChanged = await Models.LogDelegateChanged.deleteMany({
          tokenAddress: adapterAddress,
          network,
        })
        const logService = ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, network, adapterAddress)
        const deletedConfigIndexer = await Models.ConfigIndexer.deleteMany({
          id: Models.ConfigIndexer.getEntityId({ network, service: logService }),
        })
        logger.info(
          'Cleaned existing delegation data',
          llo({
            pluginAddress,
            deletedTokenDelegation: deletedTokenDelegation.deletedCount,
            deletedLogDelegateChanged: deletedLogDelegateChanged.deletedCount,
            deletedConfigIndexer: deletedConfigIndexer.deletedCount,
          }),
        )

        const crawlStartTime = Date.now()

        const delegationEvents = configIndexer
          .filter(
            (item: IIndexerConfig) =>
              item.event === 'TokensDelegated' ||
              item.event === 'TokensUndelegated' ||
              item.event === 'DelegateChanged',
          )
          .map((item: IIndexerConfig) => ({
            ...item,
            config: item.config.map(cfg => ({
              ...cfg,
              handler:
                item.event === 'TokensDelegated'
                  ? delegateTokensBatch
                  : item.event === 'TokensUndelegated'
                    ? unDelegateTokensBatch
                    : delegateChangedBatch,
            })),
          }))

        const delegationCrawler = new BlockchainLogCrawler({
          parallel: {
            enable: true,
            useBatch: true,
            batchSize: 1000,
          },
          network,
          events: delegationEvents,
          address: [adapterAddress],
          fromBlock,
          logService,
          onError: async error => {
            logger.error('Delegation crawl error', llo({ pluginAddress, error }))
          },
          stopOnError: false,
        })
        await delegationCrawler.crawl()

        const crawlDurationMs = Date.now() - crawlStartTime

        const delegateCount = await Models.LogDelegateChanged.countDocuments({
          tokenAddress: adapterAddress,
          network,
        })
        const tokenDelegationCount = await Models.TokenDelegation.countDocuments({
          contractAddress: adapterAddress,
          network,
        })

        logger.info(
          'Delegation events synced',
          llo({ pluginAddress, delegateCount, tokenDelegationCount, crawlDurationMs }),
        )
      }

      logger.info('Migration completed successfully', llo({ migration: '20260218123151-syncDelegationEvents' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260218123151-syncDelegationEvents', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default syncDelegationEventsMigration
