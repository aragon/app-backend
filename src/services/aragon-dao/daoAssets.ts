import { type HexAddress, type IAlchemyTokenBalance, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import type Dao from '@models/schema/dao'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'

const llo = logger.logMeta.bind(null, { service: 'service:dao:DaoAssets' })

export const DaoAssets = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    const startTime = Date.now()
    logger.verbose('Start DaoAssets', llo({ startTime }))

    const daoDb = await Models.Dao.findByAddress(daoAddress, network)
    if (!daoDb) return
    await DaoAssets.onDocument(daoDb)

    const duration = Date.now() - startTime
    logger.verbose('End DaoAssets', llo({ daoId: daoDb.id, duration: `${duration}ms` }))
  },

  onDocument: async (document: Dao) => {
    await DaoAssets.assets(document)
    await DaoMetrics.start({ daoAddress: document.address, network: document.network })
  },

  assets: async (document: Dao) => {
    try {
      const [ethBalance, tokenBalances] = await Promise.all([
        Web3Helper.getBalance(document.address, document.network),
        Web3Helper.getTokenBalances(document.address, document.network),
      ])

      if (Number(ethBalance) > 0) {
        const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, document.network)

        const ethAssetData: Partial<Asset> = {
          amount: ethBalance,
          network: document.network,
          daoAddress: document.address,
          tokenAddress: utils.zeroAddress, // native token
          amountUsd: Web3Helper.convertBalanceToUsd(ethBalance, token?.priceUsd || '0', token?.decimals || 0),
        }

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
            const tokenOnchainInfo = await Web3Helper.getTokenDetails(utils.zeroAddress, document.network)
            if (
              tokenOnchainInfo.decimals === null ||
              ProxyToken.analyzeIfScamToken(tokenOnchainInfo.name!, tokenOnchainInfo.symbol!)
            ) {
              logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: token.contractAddress }))
              return
            }
            const tokenDb = await ProxyToken.saveAndGetToken(token?.contractAddress!, document.network)
            const rawData: Partial<Asset> = {
              amount: token.tokenBalance,
              network: document.network,
              daoAddress: document.address,
              tokenAddress: token.contractAddress,
              amountUsd: Web3Helper.convertBalanceToUsd(
                token.tokenBalance,
                tokenDb?.priceUsd || '0',
                tokenDb?.decimals || 0,
              ),
            }

            const existingAssetDb = await Models.Asset.findExistingLog({
              daoAddress: document.address,
              tokenAddress: token.contractAddress,
              network: document.network,
            })

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
