import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { type HexAddress, ITokenType, type NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Token from '@models/schema/token'
import dayjs from '@helpers/dayjs'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'
import { type ClientSession, type SaveOptions } from 'mongoose'
import ProxyWeb3Provider from '@modules/proxyProvider'
import TokenUtils from '@helpers/tokenUtils'
import CovalentHelper from '@helpers/covalent'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyToken' })

export const ProxyToken = {
  saveAndGetToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean = false,
  ): Promise<null | Token> => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const parsedTokenAddress = Web3Utils.parseAddress(tokenAddress) || tokenAddress

        // Check for existing token
        const existingToken = await Models.Token.findExistingLog(
          {
            address: parsedTokenAddress,
            network,
          },
          { session },
        )

        if (existingToken) {
          return ProxyToken.updateTokenMetrics(existingToken, parsedTokenAddress, network, forceUpdate, session)
        }

        // Create a new token
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
      const tokenDetails = await ProxyWeb3Provider.fetchBasicTokenInfo({
        address: tokenAddress,
        network,
      })

      const tokenMetrics = await ProxyWeb3Provider.fetchTokenHolderAndSupply({
        address: tokenAddress,
        network,
      })

      updates = {
        priceUsd: tokenDetails.priceUsd,
        holders: tokenMetrics.totalHolders,
        totalSupply: tokenMetrics.totalSupply,
        lastUpdatedAt: dayjs.utc().toDate(),
      }

      await token.update(updates, { session })
      await session?.commitTransaction()
      await session?.endSession()
      logger.verbose('Updated Token Metrics', llo({ logId: token.id }))
    }

    return token
  },

  createNewToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    session?: ClientSession,
  ): Promise<Token | null> => {
    const tokenTypeInfo = await TokenDetector.detectTokenType(tokenAddress, network)
    const tokenDetails = await ProxyWeb3Provider.fetchBasicTokenInfo({
      address: tokenAddress,
      network,
    })

    const rawToken: Partial<Token & { isScamToken: boolean }> = {
      network,
      address: tokenAddress,
      name: tokenDetails?.name,
      symbol: tokenDetails?.symbol,
      decimals: tokenDetails?.decimals,
      logo: tokenDetails?.logo,
      type: tokenDetails?.type,
      holders: tokenDetails?.totalHolders,
      totalSupply: tokenDetails?.totalSupply,
      isGovernance: tokenTypeInfo.isGovernance,
      hasDelegate: tokenTypeInfo.hasDelegate,
      hasBalanceOfERC20: tokenTypeInfo.hasBalanceOfERC20,
      hasBalanceOfERC777: tokenTypeInfo.hasBalanceOfERC777,
      hasName: tokenTypeInfo.hasName,
      hasSymbol: tokenTypeInfo.hasSymbol,
      hasDecimals: tokenTypeInfo.hasDecimals,
      hasTotalSupply: tokenTypeInfo.hasTotalSupply,
      hasProxy: tokenTypeInfo.proxy,
      implementationAddress: tokenTypeInfo?.implementationAddress!,
      mintableByDao: await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network, session),
      lastUpdatedAt: dayjs.utc().toDate(),
    }

    if (tokenTypeInfo.type !== ITokenType.native) {
      if (rawToken.type === ITokenType.unknown && tokenTypeInfo.type !== ITokenType.unknown) {
        rawToken.type = tokenTypeInfo.type
      }

      if (!rawToken.name && tokenTypeInfo.hasName) {
        rawToken.name = await Web3Helper.getTokenName(tokenAddress, network)
      }

      if (!rawToken.symbol && tokenTypeInfo.hasSymbol) {
        rawToken.symbol = await Web3Helper.getTokenSymbol(tokenAddress, network)
      }

      const isTokenSyncable = await TokenUtils.isTokenSyncable(tokenAddress, network)
      if (!isTokenSyncable) {
        return null
      }

      if (!rawToken.decimals && tokenTypeInfo.hasDecimals) {
        rawToken.decimals = await Web3Helper.getTokenDecimals(tokenAddress, network)
      }

      if (!rawToken.totalSupply && tokenTypeInfo.hasTotalSupply) {
        const totalSupply = await Web3Helper.getTokenTotalSupply(tokenAddress, network)
        rawToken.totalSupply = totalSupply.toString()
      }

      if (tokenTypeInfo.hasUnderlying) {
        rawToken.underlying = await Web3Helper.getUnderlying(tokenAddress, network)
      }

      if (rawToken.isGovernance || Web3Utils.isWhitelistedToken(tokenAddress, network)) {
        const infoCreation = await ProxyWeb3Provider.fetchContractCreation({ address: tokenAddress, network })
        rawToken.blockNumber = infoCreation.blockNumber
        rawToken.transactionHash = infoCreation.transactionHash
      }

      if (rawToken.type !== ITokenType.unknown && !rawToken.holders && rawToken.holders === 0) {
        const metrics = await ProxyWeb3Provider.fetchTokenHolderAndSupply({
          address: tokenAddress,
          network,
        })
        rawToken.holders = metrics?.totalHolders
        rawToken.totalSupply = metrics?.totalSupply
        if (rawToken.totalSupply === '0' && rawToken.isGovernance) {
          rawToken.refetch = true
        }
      }
    }

    const tokenRate =
      CovalentHelper.skipTestNetworks.includes(network) || rawToken.isGovernance
        ? { priceUsd: '0' }
        : await ProxyWeb3Provider.fetchTokenPrice({
            address: tokenAddress,
            network,
          })
    rawToken.priceUsd = TokenUtils.firstValid(tokenRate.priceUsd, tokenDetails?.priceUsd) || '0'
    rawToken.skipFetchRate = TokenUtils.shouldSkipFetch(rawToken, tokenRate)

    // Save token and commit transaction
    const savedToken = await Models.Token.create(rawToken, { session })
    await session?.commitTransaction()
    await session?.endSession()

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
