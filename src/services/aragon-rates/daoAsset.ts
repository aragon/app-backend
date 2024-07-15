import { type IAlchemyTokenBalance } from '@types'
import DBCrawler from '@models/utils/crawler'
import { ZeroAddress } from 'ethers'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import { UtilsIndexer } from '@indexer/utils/indexer'
import Web3Helper from '@helpers/web3'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import { NetworkHelper } from '@helpers/network'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'rates:DaoAssets' })

export const DaoAssets = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start DaoAssets', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
      onDocument: DaoAssets.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error DaoAssets', llo({ error, document }))
      },
      where: {
        network: { $in: NetworkHelper.supportedNetworks().map(network => network.networkName) },
      },
      batchSize: config.CRAWLER_CONFIG.DAO_ASSETS_BATCH_SIZE,
      concurrency: config.CRAWLER_CONFIG.DAO_ASSETS_CONCURRENCY,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End DaoAssets',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
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
        const existingEthAssetDb = await Models.Asset.findExistingLog({
          daoAddress: document.address,
          tokenAddress: ZeroAddress,
          network: document.network,
        })

        await DbTx.executeTxFn(async ({ session }) => {
          let logDb: any
          if (existingEthAssetDb) {
            logDb = await existingEthAssetDb.update(ethAssetData, { session })
          } else {
            logDb = await Models.Asset.create(ethAssetData, { session } as any)
          }
          await session.commitTransaction()
          await session.endSession()
          logger.verbose(
            existingEthAssetDb ? 'Update ETH Asset' : 'New ETH Asset',
            llo({ logId: logDb?.id, network: logDb?.network }),
          )
        })
      }

      await Promise.all(
        tokenBalances
          .filter(token => Number(token.tokenBalance) > 0)
          .map(async (token: IAlchemyTokenBalance) => {
            let tokenDb: any = null
            if (token?.contractAddress) {
              tokenDb = await UtilsIndexer.saveAndGetToken(token.contractAddress, document.network)
            }

            const existingAssetDb = await Models.Asset.findExistingLog({
              daoAddress: document.address,
              tokenAddress: tokenDb?.address,
              network: document.network,
            })

            const rawData: Partial<Asset> = {
              amount: token.tokenBalance,
              network: document.network,
              daoAddress: document.address,
              tokenAddress: tokenDb?.address,
            }

            await DbTx.executeTxFn(async ({ session }) => {
              let logDb: any
              if (existingAssetDb) {
                logDb = await existingAssetDb.update(rawData, { session })
              } else {
                logDb = await Models.Asset.create(rawData, { session } as any)
              }

              await session.commitTransaction()
              await session.endSession()
              logger.verbose(existingAssetDb ? 'Update Token Asset' : 'New Token Asset', llo({ logId: logDb?.id }))
              return logDb
            })
          }),
      )
    } catch (error) {
      logger.error('Error DaoAssets', llo({ error, logId: document.id }))
    }
  },
}
