import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import GovernanceVeHelper from '@helpers/governanceVe'
import TokenDetector from '@helpers/tokenDetector'
import TokenUtils from '@helpers/tokenUtils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Token from '@models/schema/token'
import DbTx from '@modules/dbTx'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { IPermission } from '@src/types/permission'
import { type HexAddress, IClockMode, type ITokenInfo, ITokenType, type NetworksEnum } from '@types'
import { ethers } from 'ethers'
import { type ClientSession, type SaveOptions } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyToken' })

export const ProxyToken = {
  saveAndGetToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean = false,
  ): Promise<null | Token> => {
    const parsedTokenAddress = Web3Utils.parseAddress(tokenAddress) || tokenAddress

    const preCheckToken = await Models.Token.findExistingLog({ address: parsedTokenAddress, network })
    if (preCheckToken?.isSpam) return null
    if (preCheckToken && !forceUpdate) return preCheckToken

    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        if (preCheckToken) {
          return ProxyToken.updateTokenMetrics(preCheckToken, parsedTokenAddress, network, forceUpdate, session)
        }
        return await ProxyToken.createNewToken(parsedTokenAddress, network, session)
      })
    } catch (error) {
      logger.error('Error saveAndGetToken', llo({ error, tokenAddress, network }))
      return null
    }
  },

  updateTokenMetrics: async (
    token: Token,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean,
    session?: ClientSession,
  ): Promise<Token> => {
    const shouldUpdate = !token.skipFetchRate && token.lastUpdatedAt < dayjs().subtract(6, 'hours').toDate()
    let updates: Partial<Token> = {}

    if (shouldUpdate || forceUpdate) {
      const isNativeToken = token.type === ITokenType.native
      const isTestnet = CoinGeckoHelper.isTestNetwork(network)

      const totalSupply =
        !isNativeToken && token.hasTotalSupply ? await Web3Helper.getTokenTotalSupply(tokenAddress, network) : null

      const coingeckoInfo =
        !isTestnet || isNativeToken ? (await CoinGeckoHelper.getToken(tokenAddress, network)) || null : null

      updates = {
        totalSupply: (totalSupply ?? token.totalSupply ?? '0').toString(),
        priceUsd: coingeckoInfo ? coingeckoInfo.priceUsd : token.priceUsd,
        logo: coingeckoInfo ? coingeckoInfo.logo : token.logo,
        lastUpdatedAt: dayjs.utc().toDate(),
      }

      await token.update(updates, { session })
      await session?.commitTransaction()
      await session?.endSession()
      logger.verbose('Updated Token Metrics', llo({ logId: token.id }))
    }

    return token
  },

  wrapTokenDetails: async (tokenTypeInfo: ITokenInfo, tokenAddress: HexAddress, network: NetworksEnum) => {
    let wrappedToken: HexAddress | null = tokenAddress

    if (tokenTypeInfo.type === ITokenType.escrowAdapter) {
      const plugin = await Models.Plugin.findByTokenAddress(tokenAddress, network)
      if (plugin?.votingEscrow?.underlying) {
        wrappedToken = plugin.votingEscrow.underlying
      }
    }
    const isTestnet = CoinGeckoHelper.isTestNetwork(network)
    const coinGeckoTokenInfo =
      isTestnet && tokenTypeInfo.type !== ITokenType.native
        ? null
        : (await CoinGeckoHelper.getToken(wrappedToken!, network)) || null

    return {
      address: wrappedToken!,
      network,
      type: tokenTypeInfo.type,
      name: coinGeckoTokenInfo?.name || '',
      symbol: coinGeckoTokenInfo?.symbol || '',
      decimals: coinGeckoTokenInfo?.decimals || 18,
      totalSupply: coinGeckoTokenInfo?.totalSupply || '0',
      logo: coinGeckoTokenInfo?.logo || '',
      priceUsd: coinGeckoTokenInfo?.priceUsd || '0',
      underlying: tokenTypeInfo.type === ITokenType.escrowAdapter ? wrappedToken : undefined,
    }
  },

  createNewToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    session?: ClientSession,
  ): Promise<Token | null> => {
    const tokenTypeInfo = await TokenDetector.detectTokenType(tokenAddress, network)
    const tokenDetails = await ProxyToken.wrapTokenDetails(tokenTypeInfo, tokenAddress, network)

    const clockMode = tokenTypeInfo.hasClockMode
      ? await GovernanceErc20Helper.getClockMode(tokenAddress, network)
      : IClockMode.BlockNumber

    const rawToken: Partial<Token> = {
      network,
      address: tokenAddress,
      name: tokenDetails.name,
      symbol: tokenDetails.symbol,
      decimals: tokenDetails.decimals,
      logo: tokenDetails.logo,
      type: tokenDetails.type || tokenTypeInfo.type,
      totalSupply: tokenDetails.totalSupply,
      priceUsd: tokenDetails.priceUsd,
      underlying: tokenDetails.underlying,
      isGovernance: tokenTypeInfo.isGovernance,
      hasDelegate: tokenTypeInfo.hasDelegate,
      hasBalanceOfERC20: tokenTypeInfo.hasBalanceOfERC20,
      hasBalanceOfERC777: tokenTypeInfo.hasBalanceOfERC777,
      hasName: tokenTypeInfo.hasName,
      hasSymbol: tokenTypeInfo.hasSymbol,
      hasDecimals: tokenTypeInfo.hasDecimals,
      hasTotalSupply: tokenTypeInfo.hasTotalSupply,
      hasClockMode: tokenTypeInfo.hasClockMode,
      clockMode,
      hasProxy: tokenTypeInfo.proxy,
      implementationAddress: tokenTypeInfo?.implementationAddress!,
      mintableByDao: await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network, session),
      lastUpdatedAt: dayjs.utc().toDate(),
    }

    if (tokenTypeInfo.type !== ITokenType.native) {
      if (rawToken.type === ITokenType.unknown && tokenTypeInfo.type !== ITokenType.unknown) {
        rawToken.type = tokenTypeInfo.type
      }

      // escrow adapters have no underlying token
      if (!rawToken.underlying && tokenTypeInfo.hasUnderlying) {
        rawToken.underlying = await Web3Helper.getUnderlying(tokenAddress, network)
      }

      if (!rawToken.name && tokenTypeInfo.hasName) {
        rawToken.name = await Web3Helper.getTokenName(tokenAddress, network)
      }

      if (!rawToken.symbol && tokenTypeInfo.hasSymbol) {
        rawToken.symbol = await Web3Helper.getTokenSymbol(tokenAddress, network)
      }

      if (rawToken.type === ITokenType.escrowAdapter) {
        const underlyingTokenInfo = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(tokenAddress, network)
        rawToken.name = underlyingTokenInfo.name
        rawToken.symbol = underlyingTokenInfo.symbol

        if (!rawToken.underlying) {
          rawToken.underlying = underlyingTokenInfo.underlying
        }
      }

      if (!rawToken.decimals && tokenTypeInfo.hasDecimals) {
        rawToken.decimals = await Web3Helper.getTokenDecimals(tokenAddress, network)
      }

      if (!rawToken.totalSupply && tokenTypeInfo.hasTotalSupply) {
        const totalSupply = await Web3Helper.getTokenTotalSupply(tokenAddress, network)
        rawToken.totalSupply = totalSupply.toString()
      }

      if (rawToken.isGovernance || Web3Utils.isWhitelistedToken(tokenAddress, network)) {
        const infoCreation = await ProxyWeb3Provider.fetchContractCreation({ address: tokenAddress, network })
        rawToken.blockNumber = infoCreation?.blockNumber
        rawToken.transactionHash = infoCreation?.transactionHash
      }
    }

    const isTestnet = CoinGeckoHelper.isTestNetwork(network)

    if (isTestnet) {
      rawToken.priceUsd = '0'
    }

    rawToken.skipFetchRate = TokenUtils.shouldSkipFetch(rawToken, { priceUsd: rawToken.priceUsd || '0' })

    const spamResult = TokenUtils.shouldMarkAsSpam({
      name: rawToken.name || '',
      symbol: rawToken.symbol || '',
      logo: rawToken.logo || null,
      tokenType: rawToken.type!,
      isGovernance: rawToken.isGovernance || false,
      isTestnet,
      coinGeckoInfo: {
        priceUsd: tokenDetails.priceUsd,
      },
    })
    rawToken.spamScore = spamResult.spamScore
    rawToken.isSpam = spamResult.isSpam

    const savedToken = await Models.Token.create(rawToken, { session })
    await session?.commitTransaction()
    await session?.endSession()

    if (savedToken.isSpam) {
      logger.verbose('Spam Token Saved', llo({ logId: savedToken.id }))
      return null
    }

    logger.verbose('New Token Created', llo({ logId: savedToken.id }))
    return savedToken
  },

  checkPluginMintAuthorizationIsDao: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    session?: ClientSession,
  ): Promise<boolean> => {
    const plugin = await Models.Plugin.findByTokenAddress(tokenAddress, network, session as SaveOptions)
    if (!plugin) {
      return false
    }

    const permissionId = ethers.id(IPermission.MINT_PERMISSION)

    const permissionConfig = plugin.permissions.find(
      (p: any) => p.permissionId === permissionId && p.where === tokenAddress && p.who === plugin.daoAddress,
    )

    return !!permissionConfig
  },
}
