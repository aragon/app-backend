import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Setting from '@models/schema/setting'
import { NetworkHelper } from '@helpers/network'
import { type NetworksEnum } from '@types'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorSetting' })

export const AggregatorSetting = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start AggregatorSetting', llo({ startTime }))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogPluginSetting,
      onDocument: AggregatorSetting.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorSetting', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorSetting.query(supportedNetworks),
      batchSize: config.CRAWLER_CONFIG.DA0_SETTING_BATCH_SIZE,
      concurrency: config.CRAWLER_CONFIG.DAO_SETTING_CONCURRENCY,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End AggregatorSetting',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  async onDocument(document: Partial<Setting>) {
    const existingLog = await Models.Setting.findExistingLog({
      fromTxHash: document.fromTxHash!,
      network: document.network!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any
      if (!existingLog) {
        logDb = await Models.Setting.create(document, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Setting' : 'Aggregate Setting', llo({ logId: logDb?.id }))
    })
  },

  query(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
        },
      },
      {
        $sort: { blockNumber: 1 },
      },
      {
        $group: {
          _id: {
            pluginAddress: '$pluginAddress',
            network: '$network',
          },
          events: { $push: '$$ROOT' },
        },
      },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: '_id.pluginAddress',
          foreignField: 'pluginAddress',
          pipeline: [
            { $match: { event: 'InstallationPrepared' } },
            { $project: { daoAddress: 1, pluginAddress: 1, pluginSetupRepo: 1, subdomain: 1, tokenAddress: 1 } },
          ],
          as: 'pluginInfo',
        },
      },
      {
        $unwind: '$events',
      },
      {
        $setWindowFields: {
          partitionBy: '$_id',
          sortBy: { 'events.blockNumber': 1 },
          output: {
            nextTransactionHash: {
              $shift: {
                output: '$events.transactionHash',
                by: 1,
              },
            },
            nextBlockNumber: {
              $shift: {
                output: '$events.blockNumber',
                by: 1,
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          let: { pluginSetupRepo: { $arrayElemAt: ['$pluginInfo.pluginSetupRepo', 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$pluginRepo', '$$pluginSetupRepo'],
                },
              },
            },
            {
              $project: {
                subdomain: 1,
              },
            },
          ],
          as: 'pluginRepoInfo',
        },
      },
      {
        $addFields: {
          pluginSubdomain: {
            $arrayElemAt: ['$pluginRepoInfo.subdomain', 0],
          },
        },
      },
      {
        $project: {
          _id: 0,
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          tokenAddress: { $arrayElemAt: ['$pluginInfo.tokenAddress', 0] },
          pluginAddress: '$_id.pluginAddress',
          pluginSubdomain: 1,
          network: '$_id.network',
          fromTxHash: '$events.transactionHash',
          toTxHash: '$nextTransactionHash',
          fromBlockNumber: '$events.blockNumber',
          toBlockNumber: '$nextBlockNumber',
          settings: {
            $cond: {
              if: { $ne: [{ $ifNull: ['$events.minApprovals', null] }, null] },
              then: {
                minApprovals: '$events.minApprovals',
                onlyListed: '$events.onlyListed',
              },
              else: {
                votingMode: '$events.votingMode',
                supportThreshold: '$events.supportThreshold',
                minParticipation: '$events.minParticipation',
                minDuration: '$events.minDuration',
                minProposerVotingPower: { $toString: '$events.minProposerVotingPower' },
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: 'token',
          let: { tokenAddress: '$tokenAddress' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$address', '$$tokenAddress'],
                },
              },
            },
            {
              $project: {
                network: 1,
                type: 1,
                address: 1,
                logo: 1,
                name: 1,
                decimals: 1,
                symbol: 1,
                totalSupply: 1,
              },
            },
          ],
          as: 'token',
        },
      },
      {
        $addFields: {
          token: {
            $cond: {
              if: { $eq: [{ $size: '$token' }, 0] },
              then: null,
              else: {
                $let: {
                  vars: {
                    token: { $arrayElemAt: ['$token', 0] },
                  },
                  in: {
                    network: '$$token.network',
                    type: '$$token.type',
                    address: '$$token.address',
                    logo: '$$token.logo',
                    name: '$$token.name',
                    decimals: '$$token.decimals',
                    symbol: '$$token.symbol',
                    totalSupply: '$$token.totalSupply',
                  },
                },
              },
            },
          },
        },
      },
    ]
  },
}
