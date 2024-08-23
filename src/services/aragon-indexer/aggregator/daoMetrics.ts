import { type HexAddress, type IAlchemyTokenBalance } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'
import config from '@config'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import type Dao from '@models/schema/dao'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:AggregatorDaoMetrics' })

export const AggregatorDaoMetrics = {
  batchSize: config.CRAWLER_CONFIG.DAO_ASSETS_BATCH_SIZE,
  concurrency: config.CRAWLER_CONFIG.DAO_ASSETS_CONCURRENCY,

  start: async ({ daoAddress }: { daoAddress: HexAddress }) => {
    const startTime = Date.now()
    logger.verbose('Start DaoMetrics', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.Dao,
      onDocument: AggregatorDaoMetrics.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorDaoMetrics', llo({ error, document }))
      },
      where: {
        address: daoAddress,
        network: { $in: NetworkHelper.supportedNetworks().map(network => network.networkName) },
      },
      batchSize: AggregatorDaoMetrics.batchSize,
      concurrency: AggregatorDaoMetrics.concurrency,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End AggregatorDaoMetrics',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  onDocument: async (document: Dao) => {
    const [assets, proposalsCreated, proposalsExecuted, members, votes, uniqueVoters] = await Promise.all([
      AggregatorDaoMetrics.assets(document),
      Models.Proposal.countDocuments({ daoAddress: document.address, network: document.network }),
      Models.Proposal.countDocuments({
        daoAddress: document.address,
        network: document.network,
        'executed.status': true,
      }),
      Models.DaoMemberMapping.countDocuments({ daoAddress: document.address, network: document.network }),
      Models.Vote.countDocuments({ daoAddress: document.address, network: document.network }),
      AggregatorDaoMetrics.countUniqueMemberVotesByPlugin(document.address),
    ])

    const tvlUSD =
      Number(assets?.ethBalance!) > 0 || assets?.tokenBalances?.length! > 0
        ? await AggregatorDaoMetrics.getDaoTvl(document)
        : 0

    await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await document.update(
        {
          metrics: {
            uniqueVoters,
            tvlUSD,
            proposalsCreated,
            proposalsExecuted,
            votes,
            members,
          },
        },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Update Dao metrics', llo({ logId: logDb?.id }))
    })
  },

  assets: async (document: Dao) => {
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
          tokenAddress: utils.zeroAddress, // native token
        }

        await ProxyToken.saveAndGetToken(utils.zeroAddress, document.network)

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
            existingEthAssetDb ? 'Update Native Asset' : 'New Native Asset',
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
              tokenDb = await ProxyToken.saveAndGetToken(token.contractAddress, document.network)
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

      return { ethBalance, tokenBalances }
    } catch (error) {
      logger.error('Error AggregatorDaoMetrics', llo({ error, logId: document.id }))
    }
  },

  countUniqueMemberVotesByPlugin: async (daoAddress: HexAddress) => {
    const results = await Models.Vote.aggregate([
      {
        $match: { daoAddress },
      },
      {
        $group: {
          _id: {
            memberAddress: '$memberAddress',
            pluginAddress: '$pluginAddress',
          },
        },
      },
      {
        $group: {
          _id: null,
          uniqueVotes: { $sum: 1 },
        },
      },
    ])

    return results.length > 0 ? results[0].uniqueVotes : 0
  },

  getDaoTvl: async (document: Dao): Promise<number> => {
    const response = await Models.Asset.getDaoTvl(document.address, document.network)
    return Number(response?.tvlUsd || 0)
  },
}
