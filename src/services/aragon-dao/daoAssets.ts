import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import TokenSpam from '@helpers/tokenSpam'
import TokenUtils from '@helpers/tokenUtils'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Asset from '@models/schema/asset'
import type Dao from '@models/schema/dao'
import type Token from '@models/schema/token'
import DbTx from '@modules/dbTx'
import { ProxyToken } from '@modules/proxyToken'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { type HexAddress, ITokenType, ITransactionType, type NetworksEnum, SpamSource } from '@types'
import { formatUnits } from 'ethers'

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

  /**
   * Upserts a single Asset row (find → update/create → commit) from an authoritative balance.
   * Every write path funnels through here via `_applyTokenBalance`.
   */
  _upsertAsset: async ({
    daoAddress,
    tokenAddress,
    network,
    amount,
    token,
    label,
  }: {
    daoAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
    amount: string
    token: any
    label: string
  }) => {
    await DbTx.executeTxFn(async ({ session }) => {
      const existingAssetDb = await Models.Asset.findExistingLog({ daoAddress, tokenAddress, network }, { session })

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

      await DbTx.safeCommit(session)
      logger.verbose(existingAssetDb ? `Update ${label}` : `New ${label}`, llo({ logId: logDb?.id }))
    })
  },

  /**
   * Targeted single-token asset sync. Driven per individual transfer (in/out) from
   * `DaoTransferHandler`, where the exact token that moved is already known, and reused by the
   * bulk `assets()` rescan for every known token. Reads the token's live on-chain balance
   * (direct `balanceOf` at latest) and upserts just that Asset row, or removes it once the
   * balance reaches a confirmed zero.
   */
  syncToken: async ({
    daoAddress,
    tokenAddress,
    network,
    skipMetrics,
  }: {
    daoAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
    skipMetrics?: boolean
  }) => {
    try {
      const dao = Web3Utils.parseAddress(daoAddress) || daoAddress
      const token = Web3Utils.parseAddress(tokenAddress) || tokenAddress

      if (TokenUtils.isNativeTokenAlias(token, network)) {
        logger.verbose(
          'syncToken redirected: native ERC20 alias',
          llo({ daoAddress: dao, tokenAddress: token, network }),
        )
        await DaoAssets._applyTokenBalance({
          daoAddress: dao,
          tokenAddress: token,
          network,
          amount: '0',
          token: null,
        })
        await DaoAssets.syncNative({ daoAddress: dao, network, skipMetrics })
        return
      }

      const isSyncableToken = await TokenUtils.isTokenSyncable(token, network)
      if (!isSyncableToken) {
        logger.warn('Skip Token Asset: Marked as spam', llo({ tokenAddress: token }))
        await DaoAssets._applyTokenBalance({ daoAddress: dao, tokenAddress: token, network, amount: '0', token: null })
        if (!skipMetrics) await DaoMetrics.start({ daoAddress: dao, network })
        return
      }

      const tokenDb = await ProxyToken.saveAndGetToken(token, network)
      if (!tokenDb) {
        logger.error('syncToken token not found', llo({ daoAddress: dao, tokenAddress: token, network }))
        return
      }

      if (tokenDb.type === ITokenType.ERC721 || tokenDb.type === ITokenType.ERC1155) {
        logger.warn(
          'syncToken skipped: non-fungible token',
          llo({ daoAddress: dao, tokenAddress: token, network, type: tokenDb.type }),
        )
        await DaoAssets._applyTokenBalance({ daoAddress: dao, tokenAddress: token, network, amount: '0', token: null })
        if (!skipMetrics) await DaoMetrics.start({ daoAddress: dao, network })
        return
      }

      const { balance: rawBalance, unreadable } = await Web3Helper.getERC20BalanceResult(dao, token, network)

      if (unreadable) {
        const marked = await DaoAssets._handleUnreadableToken({
          daoAddress: dao,
          tokenAddress: token,
          network,
          token: tokenDb,
        })
        if (marked && !skipMetrics) await DaoMetrics.start({ daoAddress: dao, network })
        return
      }

      if (rawBalance === null) {
        logger.warn('syncToken skipped: balance read failed', llo({ daoAddress: dao, tokenAddress: token, network }))
        return
      }

      const amount = formatUnits(rawBalance, tokenDb.decimals || 0)
      await DaoAssets._applyTokenBalance({ daoAddress: dao, tokenAddress: token, network, amount, token: tokenDb })
      if (!skipMetrics) await DaoMetrics.start({ daoAddress: dao, network })
    } catch (error) {
      logger.error('error syncToken', llo({ daoAddress, tokenAddress, network, error }))
    }
  },

  /**
   * Targeted native-balance sync. Same idea as `syncToken` but for the DAO's native coin,
   * driven by native deposit/withdraw transfers. Reads the live balance and upserts (or removes)
   * the zero-address Asset row.
   */
  syncNative: async ({
    daoAddress,
    network,
    skipMetrics,
  }: {
    daoAddress: HexAddress
    network: NetworksEnum
    skipMetrics?: boolean
  }) => {
    try {
      const dao = Web3Utils.parseAddress(daoAddress) || daoAddress

      const tokenDb = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)
      if (!tokenDb) {
        logger.error('syncNative token not found', llo({ daoAddress: dao, network }))
        return
      }

      const rawBalance = await Web3Helper.getNativeBalance(dao, network)
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
      if (!skipMetrics) await DaoMetrics.start({ daoAddress: dao, network })
    } catch (error) {
      logger.error('error syncNative', llo({ daoAddress, network, error }))
    }
  },

  _handleUnreadableToken: async ({
    daoAddress,
    tokenAddress,
    network,
    token,
  }: {
    daoAddress: HexAddress
    tokenAddress: HexAddress
    network: NetworksEnum
    token: Token
  }): Promise<boolean> => {
    const verdict = TokenSpam.evaluate({
      name: token.name || '',
      symbol: token.symbol || '',
      logo: token.logo || null,
      tokenType: token.type,
      isGovernance: token.isGovernance,
      isTestnet: CoinGeckoHelper.isTestNetwork(network),
      coinGeckoInfo: null,
      extraSignals: [TokenSpam.UNREADABLE_BALANCE_SIGNAL],
    })

    if (!verdict.isSpam) {
      return false
    }

    await token.update({
      isSpam: true,
      spamScore: Math.max(token.spamScore || 0, verdict.spamScore),
      spamSource: SpamSource.UNREADABLE,
    })

    logger.warn(
      'Marked token as spam: balanceOf unreadable',
      llo({ daoAddress, tokenAddress, network, tokenName: token.name, tokenSymbol: token.symbol }),
    )

    await DaoAssets._applyTokenBalance({ daoAddress, tokenAddress, network, amount: '0', token: null })
    return true
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
    if (Number(amount) > 0) {
      await DaoAssets._upsertAsset({ daoAddress, tokenAddress, network, amount, token, label: 'Asset (targeted)' })
      return
    }

    await DbTx.executeTxFn(async ({ session }) => {
      const existingAssetDb = await Models.Asset.findExistingLog({ daoAddress, tokenAddress, network }, { session })
      if (existingAssetDb) {
        await Models.Asset.deleteMany({ daoAddress, tokenAddress, network }, { session })
        logger.verbose('Deleted zero-balance asset', llo({ daoAddress, tokenAddress, network }))
      }
      await DbTx.safeCommit(session)
    })
  },

  /**
   * Full asset rescan, admin-triggered. Re-verifies every token the DAO has ever touched — the
   * union of its erc20 transfer history and its existing Asset rows — against the chain, via the
   * same targeted `syncToken` / `syncNative` primitives the per-transfer path uses. No third-party
   * balance enumeration (Alchemy enhanced API / explorers): the token universe comes from our own
   * indexed transfers, and every row change is confirmed by a direct `balanceOf` / `eth_getBalance`
   * read — a zero-balance row is only ever deleted on a confirmed on-chain zero, never via a blind
   * `$nin` prune against a possibly-incomplete external list.
   */
  assets: async (document: Dao) => {
    try {
      const [transferTokens, assetTokens] = await Promise.all([
        Models.Transaction.distinct('tokenAddress', {
          daoAddress: document.address,
          network: document.network,
          type: ITransactionType.erc20,
        }),
        Models.Asset.distinct('tokenAddress', { daoAddress: document.address, network: document.network }),
      ])

      const knownTokenAddresses = [...new Set([...transferTokens, ...assetTokens])].filter(
        tokenAddress => tokenAddress && tokenAddress !== utils.zeroAddress,
      )
      const nativeAliasAddresses = knownTokenAddresses.filter(tokenAddress =>
        TokenUtils.isNativeTokenAlias(tokenAddress, document.network),
      )
      const tokenAddresses = knownTokenAddresses.filter(
        tokenAddress => !TokenUtils.isNativeTokenAlias(tokenAddress, document.network),
      )

      await Promise.all([
        utils.processParallel(
          tokenAddresses,
          (tokenAddress: HexAddress) =>
            DaoAssets.syncToken({
              daoAddress: document.address,
              tokenAddress,
              network: document.network,
              skipMetrics: true,
            }),
          { concurrency: 5 },
        ),
        utils.processParallel(
          nativeAliasAddresses,
          (tokenAddress: HexAddress) =>
            DaoAssets._applyTokenBalance({
              daoAddress: document.address,
              tokenAddress,
              network: document.network,
              amount: '0',
              token: null,
            }),
          { concurrency: 5 },
        ),
      ])
      await DaoAssets.syncNative({ daoAddress: document.address, network: document.network, skipMetrics: true })

      return { tokenAddresses }
    } catch (error) {
      logger.error('Error DaoAssets', llo({ error, logId: document.id }))
    }
  },
}
