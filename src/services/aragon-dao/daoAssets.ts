import { type HexAddress, type IWeb3TokenBalance, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Asset from '@models/schema/asset'
import utils from '@helpers/utils'
import { ProxyToken } from '@modules/proxyToken'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import TokenUtils from '@helpers/tokenUtils'
import Web3Utils from '@helpers/web3Utils'
import type Dao from '@models/schema/dao'
import ProxyWeb3Provider from '@modules/proxyProvider'

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

  _handleNativeToken: async (document: Dao, ethBalance: string) => {
    try {
      const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, document.network)

      if (!token) {
        logger.error('assets token not found', llo({ logId: document?.id }))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const existingEthAssetDb = await Models.Asset.findExistingLog(
          {
            daoAddress: document.address,
            tokenAddress: utils.zeroAddress,
            network: document.network,
          },
          { session },
        )

        const ethAssetData: Partial<Asset> = {
          amount: ethBalance,
          network: document.network,
          daoAddress: document.address,
          tokenAddress: utils.zeroAddress, // native token
          amountUsd: Web3Utils.convertBalanceToUsd(ethBalance, token?.priceUsd || '0', token?.decimals || 0),
        }

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
    } catch (error) {
      logger.error('error asset handle native token', llo({ logId: document?.id, error }))
    }
  },

  _handleErc20Token: async (document: Dao, tokenBalance: IWeb3TokenBalance) => {
    try {
      const isSyncableToken = await TokenUtils.isTokenSyncable(tokenBalance.contractAddress!, document.network)
      if (!isSyncableToken) {
        logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: tokenBalance.contractAddress }))
        return
      }
      const tokenDb = await ProxyToken.saveAndGetToken(tokenBalance?.contractAddress!, document.network)

      if (!tokenDb) {
        logger.error('tokenBalances token not found', llo({ logId: document?.id }))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const rawData: Partial<Asset> = {
          amount: tokenBalance.tokenBalance,
          network: document.network,
          daoAddress: document.address,
          tokenAddress: tokenBalance.contractAddress,
          amountUsd: Web3Utils.convertBalanceToUsd(
            tokenBalance.tokenBalance,
            tokenDb?.priceUsd || '0',
            tokenDb?.decimals || 0,
          ),
        }

        const existingAssetDb = await Models.Asset.findExistingLog(
          {
            daoAddress: document.address,
            tokenAddress: tokenBalance.contractAddress,
            network: document.network,
          },
          { session },
        )

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
    } catch (error) {
      logger.error('error asset handle erc20 token', llo({ logId: document?.id, error }))
    }
  },

  assets: async (document: Dao) => {
    try {
      const [ethBalance, tokenBalances] = await Promise.all([
        ProxyWeb3Provider.getNativeBalance({ address: document.address, network: document.network }),
        ProxyWeb3Provider.getTokenBalances({ address: document.address, network: document.network }),
      ])

      if (Number(ethBalance) > 0) {
        await DaoAssets._handleNativeToken(document, ethBalance)
      }

      await Promise.all(
        tokenBalances
          .filter(token => Number(token.tokenBalance) > 0)
          .map(async (tokenBalance: IWeb3TokenBalance) => {
            await DaoAssets._handleErc20Token(document, tokenBalance)
          }),
      )

      return { ethBalance, tokenBalances }
    } catch (error) {
      logger.error('Error DaoAssets', llo({ error, logId: document.id }))
    }
  },
}
