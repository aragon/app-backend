import { type HexAddress, type IAlchemyTokenBalance, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import type Dao from '@models/schema/dao'
import { AggregatorDaoMetrics } from '@indexer/aggregator/daoMetrics'

const llo = logger.logMeta.bind(null, { service: 'service:dao-sync:DaoAssets' })

export const DaoAssets = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    const startTime = Date.now()
    logger.verbose('Start DaoMetrics', llo({ startTime }))

    const daoDb = await Models.Dao.findByAddress(daoAddress, network)
    await DaoAssets.onDocument(daoDb)

    const duration = Date.now() - startTime
    logger.verbose('End DaoAssets', llo({ daoId: daoDb.id, duration: `${duration}ms` }))
  },

  onDocument: async (document: Dao) => {
    await DaoAssets.assets(document)
    await AggregatorDaoMetrics.start({ daoAddress: document.address, network: document.network })
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
            if (token?.contractAddress) {
              await ProxyToken.saveAndGetToken(token.contractAddress, document.network)
            } else {
              logger.error('Error Token balance missing contractAddress', llo({ token }))
            }

            const existingAssetDb = await Models.Asset.findExistingLog({
              daoAddress: document.address,
              tokenAddress: token.contractAddress,
              network: document.network,
            })

            const rawData: Partial<Asset> = {
              amount: token.tokenBalance,
              network: document.network,
              daoAddress: document.address,
              tokenAddress: token.contractAddress,
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
      logger.error('Error DaoAssets', llo({ error, logId: document.id }))
    }
  },
}
