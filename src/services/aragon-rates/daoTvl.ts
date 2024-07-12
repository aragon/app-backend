import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { type ENS, type HexAddress, type NetworksEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:DaoTvl' })

interface IQueryResult {
  ens: ENS
  address: HexAddress
  network: NetworksEnum
  tvlUsd: number
}

export const DaoTvl = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start DaoTvl', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.Asset,
      onDocument: DaoTvl.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error FetchRates', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: DaoTvl.query(),
      batchSize: config.CRAWLER_CONFIG.ENS_BATCH_SIZE,
      concurrency: config.CRAWLER_CONFIG.ENS_CONCURRENCY,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose('End DaoTvl', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt, duration: `${duration}ms` }))
  },

  onDocument: async function (document: IQueryResult) {
    const dao = await Models.Dao.findExistingLog({ address: document.address, network: document.network })
    if (dao) {
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await dao.update({ tvlUSD: document.tvlUsd.toString() }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Dao tvlUSD', llo({ logId: logDb?.id }))
      })
    }
  },

  query() {
    return [
      {
        $lookup: {
          from: 'token',
          let: { tokenAddress: '$tokenAddress', network: '$network' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$address', '$$tokenAddress'] }, { $eq: ['$network', '$$network'] }],
                },
              },
            },
          ],
          as: 'rate',
        },
      },
      {
        $unwind: {
          path: '$rate',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          priceUsd: {
            $ifNull: [{ $toDecimal: '$rate.priceUsd' }, 0],
          },
          decimals: {
            $ifNull: [{ $toInt: '$rate.decimals' }, 18],
          },
          amountBigInt: { $toDecimal: '$amount' },
        },
      },
      {
        $addFields: {
          normalizedAmount: {
            $divide: ['$amountBigInt', { $pow: [10, '$decimals'] }],
          },
        },
      },
      {
        $addFields: {
          totalValueUsd: {
            $multiply: ['$priceUsd', '$normalizedAmount'],
          },
        },
      },
      {
        $group: {
          _id: '$daoAddress',
          totalValueUsd: {
            $sum: '$totalValueUsd',
          },
          dao: { $first: '$$ROOT' },
        },
      },
      {
        $addFields: {
          totalValueUsdRounded: {
            $round: ['$totalValueUsd', 2],
          },
        },
      },
      {
        $lookup: {
          from: 'dao',
          localField: 'dao.daoAddress',
          foreignField: 'address',
          as: 'daoInfo',
        },
      },
      {
        $unwind: {
          path: '$daoInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          address: '$dao.daoAddress',
          network: '$dao.network',
          tvlUsd: '$totalValueUsdRounded',
          ens: { $ifNull: ['$daoInfo.ens', null] },
        },
      },
    ]
  },
}
