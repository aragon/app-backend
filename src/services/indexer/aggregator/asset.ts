import { AggregatorTypeEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { ZeroAddress } from 'ethers'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import DuneHelper from '@helpers/dune'
import type Asset from '@models/schema/asset'
import type Dao from '@models/schema/dao'
import { UtilsIndexer } from '@models/utils/indexer'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorAssets' })

export const AggregatorAssets = {
  start: async () => {
    logger.verbose('Start AggregatorAssets', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.assets)

    const crawler = new DBCrawler({
      model: Models.Dao,
      onDocument: AggregatorAssets.onDocument,
      onError: (error: any) => {
        logger.error('Error AggregatorAssets', llo({ error }))
      },
      where: {},
      batchSize: 500,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End AggregatorAssets', llo({}))
  },

  onDocument: async (document: Dao) => {
    const duneBalance = await DuneHelper.getBalance(document.daoAddress)

    await Promise.all(
      duneBalance.balances.map(async duneAsset => {
        const existingAssetDb = await Models.Asset.findExistingLog(
          document.daoAddress,
          duneAsset.address === 'native' ? ZeroAddress : duneAsset.address,
          DuneHelper.duneNetworkToAragon(duneAsset.chain),
        )

        const rawData: Partial<Asset> = {
          amount: duneAsset.amount?.toString(),
        }

        if (!existingAssetDb) {
          rawData.network = DuneHelper.duneNetworkToAragon(duneAsset.chain)
          rawData.daoAddress = document.daoAddress
          rawData.daoAddress = document.daoAddress
          rawData.tokenAddress = duneAsset.address === 'native' ? ZeroAddress : duneAsset.address
        }

        await DbTx.executeTxFn(async ({ session }) => {
          let logDb: any = null
          if (existingAssetDb) {
            logDb = await existingAssetDb.update(rawData, { session })
          } else {
            logDb = await Models.Asset.create(rawData, { session })
          }

          await session.commitTransaction()
          await session.endSession()
          logger.verbose(existingAssetDb ? 'Update Asset' : 'New Asset', llo({ logId: logDb?.id }))
        })
      }),
    )
  },
}
