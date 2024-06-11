import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { type HexAddress, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:DaoTvl' })

interface IQueryResult {
  address: HexAddress
  network: NetworksEnum
  tvlUsd: number
}

export const DaoTvl = {
  start: async () => {
    logger.verbose('Start DaoTvl', llo({}))

    const result: IQueryResult[] = await Models.Asset.aggregate(DaoTvl.query())

    await Promise.all(
      result.map(async (data: IQueryResult) => {
        const dao = await Models.Dao.findExistingLog(data.address, data.network)
        if (dao) {
          await DbTx.executeTxFn(async ({ session }) => {
            await dao.update({ tvlUSD: data.tvlUsd.toString() }, { session })
            await session.commitTransaction()
            await session.endSession()
          })
        }
      }),
    )
    logger.verbose('End DaoTvl', llo())
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
        $project: {
          _id: 0,
          address: '$dao.daoAddress',
          network: '$dao.network',
          tvlUsd: '$totalValueUsdRounded',
        },
      },
    ]
  },
}
