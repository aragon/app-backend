import config from '@config'
import { Models } from '@dbModels'
import TokenUtils from '@helpers/tokenUtils'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Asset from '@models/schema/asset'
import type Dao from '@models/schema/dao'
import DbTx from '@modules/dbTx'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ProxyToken } from '@modules/proxyToken'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { type HexAddress, type IWeb3TokenBalance, NetworksEnum } from '@types'
import { formatUnits } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:dao:DaoAssets' })

const EXPLORER_LAGGING_NETWORKS = new Set<NetworksEnum>([
  NetworksEnum.citreaMainnet,
  NetworksEnum.hemiMainnet,
  NetworksEnum.chilizMainnet,
])

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
      const isSyncableToken = await TokenUtils.isTokenSyncable(tokenBalance.contractAddress, document.network)
      if (!isSyncableToken) {
        logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: tokenBalance.contractAddress }))
        return
      }
      const tokenDb = await ProxyToken.saveAndGetToken(tokenBalance.contractAddress, document.network)

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

  _removeStaleAssets: async (document: Dao, tokenBalances: IWeb3TokenBalance[]) => {
    try {
      const activeTokenAddresses = tokenBalances.map(token => token.contractAddress)

      await DbTx.executeTxFn(async ({ session }) => {
        const result = await Models.Asset.deleteMany(
          {
            daoAddress: document.address,
            network: document.network,
            tokenAddress: { $nin: activeTokenAddresses },
          },
          { session },
        )

        if (result.deletedCount > 0) {
          logger.verbose(
            'Deleted stale token assets',
            llo({ daoAddress: document.address, count: result.deletedCount }),
          )
        }

        await session.commitTransaction()
        await session.endSession()
      })
    } catch (error) {
      logger.error('Error removing stale assets', llo({ error, logId: document.id }))
    }
  },

  /**
   * Targeted single-token asset sync. Driven per individual transfer (in/out) from
   * `DaoTransferHandler`, where the exact token that moved is already known. Reads the token's
   * live on-chain balance (direct `balanceOf` at latest — no Alchemy enhanced-index lag, unlike
   * the bulk `assets()` rescan) and upserts just that Asset row, or removes it once the balance
   * reaches a confirmed zero. Avoids pulling the whole portfolio + delete-all/re-add for what is
   * usually a 1–2 token delta.
   */
  syncToken: async ({
    daoAddress,
    tokenAddress,
    network,
  }: {
    daoAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
  }) => {
    try {
      const dao = Web3Utils.parseAddress(daoAddress) || daoAddress
      const token = Web3Utils.parseAddress(tokenAddress) || tokenAddress

      const isSyncableToken = await TokenUtils.isTokenSyncable(token, network)
      if (!isSyncableToken) {
        logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: token }))
        return
      }

      const tokenDb = await ProxyToken.saveAndGetToken(token, network)
      if (!tokenDb) {
        logger.error('syncToken token not found', llo({ daoAddress: dao, tokenAddress: token, network }))
        return
      }

      const rawBalance = await Web3Helper.getERC20BalanceOrNull(dao, token, network)
      // null = failed read; never delete/upsert on an unconfirmed balance.
      if (rawBalance === null) {
        logger.warn('syncToken skipped: balance read failed', llo({ daoAddress: dao, tokenAddress: token, network }))
        return
      }

      const amount = formatUnits(rawBalance, tokenDb.decimals || 0)
      await DaoAssets._applyTokenBalance({ daoAddress: dao, tokenAddress: token, network, amount, token: tokenDb })
    } catch (error) {
      logger.error('error syncToken', llo({ daoAddress, tokenAddress, network, error }))
    }
  },

  /**
   * Targeted native-balance sync. Same idea as `syncToken` but for the DAO's native coin,
   * driven by native deposit/withdraw transfers. Reads the live balance and upserts (or removes)
   * the zero-address Asset row.
   */
  syncNative: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    try {
      const dao = Web3Utils.parseAddress(daoAddress) || daoAddress

      const tokenDb = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)
      if (!tokenDb) {
        logger.error('syncNative token not found', llo({ daoAddress: dao, network }))
        return
      }

      const rawBalance = await Web3Helper.getNativeBalance(dao, network)
      // null = failed read; never delete/upsert on an unconfirmed balance.
      if (rawBalance === null || rawBalance === undefined) {
        logger.warn('syncNative skipped: balance read failed', llo({ daoAddress: dao, network }))
        return
      }

      const amount = formatUnits(BigInt(rawBalance), tokenDb.decimals || 0)
      await DaoAssets._applyTokenBalance({
        daoAddress: dao,
        tokenAddress: utils.zeroAddress,
        network,
        amount,
        token: tokenDb,
      })
    } catch (error) {
      logger.error('error syncNative', llo({ daoAddress, network, error }))
    }
  },

  /**
   * Upserts a single Asset row from an authoritative balance, or removes it on a confirmed zero.
   * Shared by the targeted `syncToken` / `syncNative` paths. Only ever touches the one token —
   * never a bulk `$nin` delete.
   */
  _applyTokenBalance: async ({
    daoAddress,
    tokenAddress,
    network,
    amount,
    token,
  }: {
    daoAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
    amount: string
    token: any
  }) => {
    await DbTx.executeTxFn(async ({ session }) => {
      const existingAssetDb = await Models.Asset.findExistingLog({ daoAddress, tokenAddress, network }, { session })

      // Confirmed zero balance: remove only this token's Asset to mirror live state.
      if (!(Number(amount) > 0)) {
        if (existingAssetDb) {
          await Models.Asset.deleteMany({ daoAddress, tokenAddress, network }, { session })
          logger.verbose('Deleted zero-balance asset', llo({ daoAddress, tokenAddress, network }))
        }
        await session.commitTransaction()
        await session.endSession()
        return
      }

      const rawData: Partial<Asset> = {
        amount,
        network,
        daoAddress,
        tokenAddress,
        amountUsd: Web3Utils.convertBalanceToUsd(amount, token?.priceUsd || '0', token?.decimals || 0),
      }

      const logDb = existingAssetDb
        ? await existingAssetDb.update(rawData, { session })
        : await Models.Asset.create(rawData, { session } as any)

      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingAssetDb ? 'Update Asset (targeted)' : 'New Asset (targeted)', llo({ logId: logDb?.id }))
    })
  },

  assets: async (document: Dao) => {
    try {
      if (EXPLORER_LAGGING_NETWORKS.has(document.network)) {
        await utils.wait(config.SERVICES.ARAGON_DAO.EXPLORER_REFRESH_DELAY)
      }

      const [ethBalance, tokenBalances] = await Promise.all([
        ProxyWeb3Provider.getNativeBalance({ address: document.address, network: document.network }),
        ProxyWeb3Provider.getTokenBalances({ address: document.address, network: document.network }),
      ])

      await DaoAssets._removeStaleAssets(
        document,
        Number(ethBalance) > 0
          ? [...tokenBalances, { contractAddress: utils.zeroAddress, tokenBalance: ethBalance }]
          : [...tokenBalances],
      )

      if (Number(ethBalance) > 0) {
        await DaoAssets._handleNativeToken(document, ethBalance)
      }

      await utils.asyncForEach(
        tokenBalances.filter(token => Number(token.tokenBalance) > 0),
        async (tokenBalance: IWeb3TokenBalance) => DaoAssets._handleErc20Token(document, tokenBalance),
      )

      return { ethBalance, tokenBalances }
    } catch (error) {
      logger.error('Error DaoAssets', llo({ error, logId: document.id }))
    }
  },
}
