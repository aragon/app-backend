import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Vote from '@models/schema/vote'
import { NetworkHelper } from '@helpers/network'
import { type NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorVote' })

export const AggregatorVote = {
  start: async () => {
    logger.verbose('Start AggregatorVote', llo({}))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogProposal,
      onDocument: AggregatorVote.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorVote', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorVote.query(supportedNetworks),
      batchSize: 500,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorVote', llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt }))
  },

  async onDocument(document: Partial<Vote>) {
    const existingLog = await Models.Vote.findExistingLog({
      network: document.network!,
      transactionHash: document.transactionHash!,
      pluginAddress: document.pluginAddress!,
      proposalId: document.proposalId!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any

      if (Web3Helper.needToSyncBlockTime(existingLog)) {
        document.blockTimestamp = await Web3Helper.getBlockTimestamp(document.blockNumber!, document.network!)
      }

      if (!existingLog) {
        logDb = await Models.Vote.create(document, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Vote' : 'Aggregate Vote', llo({ logId: logDb?.id }))
    })
  },

  query(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
          'voteEvents.0': { $exists: true },
        },
      },
      { $unwind: '$voteEvents' },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          let: { pluginAddress: '$pluginAddress' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$pluginAddress', '$$pluginAddress'] }, { $eq: ['$event', 'InstallationPrepared'] }],
                },
              },
            },
            { $project: { tokenAddress: 1, daoAddress: 1 } },
          ],
          as: 'pluginDetails',
        },
      },
      { $unwind: { path: '$pluginDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'token',
          let: { tokenAddress: '$pluginDetails.tokenAddress' },
          pipeline: [
            { $match: { $expr: { $eq: ['$address', '$$tokenAddress'] } } },
            { $project: { type: 1, address: 1, logo: 1, name: 1, decimals: 1, symbol: 1 } },
          ],
          as: 'tokenDetails',
        },
      },
      { $unwind: { path: '$tokenDetails', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          memberAddress: '$voteEvents.memberAddress',
          proposalId: 1,
          pluginAddress: 1,
          voteOption: '$voteEvents.voteOption',
          votingPower: '$voteEvents.votingPower',
          transactionHash: '$voteEvents.transactionHash',
          blockNumber: '$voteEvents.blockNumber',
          network: 1,
          daoAddress: '$pluginDetails.daoAddress',
          token: {
            $cond: {
              if: { $eq: [{ $type: '$tokenDetails' }, 'missing'] },
              then: null,
              else: {
                address: { $ifNull: ['$tokenDetails.address', '$pluginDetails.tokenAddress'] },
                type: '$tokenDetails.type',
                logo: '$tokenDetails.logo',
                name: '$tokenDetails.name',
                decimals: '$tokenDetails.decimals',
                symbol: '$tokenDetails.symbol',
              },
            },
          },
        },
      },
    ]
  },
}
