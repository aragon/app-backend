import { type HexAddress, type IAlchemyTokenBalance, type NetworksEnum } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import Web3Helper from '@helpers/web3'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import { NetworkHelper } from '@helpers/network'
import config from '@config'
import utils from '@helpers/utils'
import { TokenProxy } from '@modules/tokenProxy'

const llo = logger.logMeta.bind(null, { service: 'rates:DaoAssets' })

export const DaoAssets = {
  batchSize: config.CRAWLER_CONFIG.DAO_ASSETS_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.DAO_ASSETS_CONCURRENCY,

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
      batchSize: DaoAssets.batchSize,
      concurrency: DaoAssets.concurrency,
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
          tokenAddress: utils.zeroAddress, // ETH native token
        }

        await TokenProxy.saveAndGetToken(utils.zeroAddress, document.network)

        const existingEthAssetDb = await Models.Asset.findExistingLog({
          daoAddress: document.address,
          tokenAddress: utils.zeroAddress,
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
              tokenDb = await TokenProxy.saveAndGetToken(token.contractAddress, document.network)
            } else {
              logger.error('Error Token balance missing contractAddress', llo({ token }))
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

      if (Number(ethBalance) > 0 || tokenBalances.length > 0) {
        await DaoAssets.daoTvl(document.address, document.network)
      }
    } catch (error) {
      logger.error('Error DaoAssets', llo({ error, logId: document.id }))
    }
  },

  daoTvl: async (daoAddress: HexAddress, network: NetworksEnum) => {
    const dao = await Models.Dao.findExistingLog({ address: daoAddress, network })

    if (dao) {
      const response = await Models.Asset.getDaoTvl(daoAddress, network)
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await dao.update({ tvlUSD: response.tvlUsd }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Dao tvlUSD', llo({ logId: logDb?.id }))
      })
    }
  },
}
