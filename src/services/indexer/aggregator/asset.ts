import { AggregatorTypeEnum, type IAlchemyTokenBalance } from '@types'
import DBCrawler from '@models/utils/crawler'
import { ZeroAddress } from 'ethers'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import { UtilsIndexer } from '@models/utils/indexer'
import Web3Helper from '@helpers/web3'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorAssets' })

export const AggregatorAssets = {
  start: async () => {
    logger.verbose('Start AggregatorAssets', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.assets)

    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
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

  onDocument: async (document: LogDaoRegistry) => {
    try {
      const [ethBalance, tokenBalances] = await Promise.all([
        Web3Helper.getBalance(document.address, document.network),
        Web3Helper.getTokenBalances(document.address, document.network),
      ])

      if (Number(ethBalance) > 0) {
        const ethAssetData: Partial<Asset> = {
          amount: ethBalance,
          network: document.network,
          daoAddress: document.address,
          tokenAddress: ZeroAddress, // ETH native token
        }
        const existingEthAssetDb = await Models.Asset.findExistingLog(document.address, ZeroAddress, document.network)

        await DbTx.executeTxFn(async ({ session }) => {
          let logDb: any = null
          if (existingEthAssetDb) {
            logDb = await existingEthAssetDb.update(ethAssetData, { session })
          } else {
            logDb = await Models.Asset.create(ethAssetData, { session })
          }
          await session.commitTransaction()
          await session.endSession()
          logger.verbose(existingEthAssetDb ? 'Update ETH Asset' : 'New ETH Asset', llo({ logId: logDb?.id }))
        })
      }

      await Promise.all(
        tokenBalances
          .filter(token => Number(token.tokenBalance) > 0)
          .map(async (token: IAlchemyTokenBalance) => {
            const existingAssetDb = await Models.Asset.findExistingLog(
              document.address,
              token.contractAddress,
              document.network,
            )

            const rawData: Partial<Asset> = {
              amount: token.tokenBalance,
              network: document.network,
              daoAddress: document.address,
              tokenAddress: token.contractAddress,
            }

            const assetDb = await DbTx.executeTxFn(async ({ session }) => {
              let logDb: any = null
              if (existingAssetDb) {
                logDb = await existingAssetDb.update(rawData, { session })
              } else {
                logDb = await Models.Asset.create(rawData, { session })
              }

              await session.commitTransaction()
              await session.endSession()
              logger.verbose(existingAssetDb ? 'Update Token Asset' : 'New Token Asset', llo({ logId: logDb?.id }))
              return logDb
            })

            if (assetDb.tokenAddress) {
              await UtilsIndexer.saveAndGetToken(assetDb.tokenAddress, assetDb.network)
            }
          }),
      )
    } catch (error) {
      logger.error('Error AggregatorAssets', llo({ error, logId: document.id }))
    }
  },
}
