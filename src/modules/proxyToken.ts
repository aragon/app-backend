import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { type HexAddress, type ITokenDetails, ITokenType, type NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import dayjs from '@helpers/dayjs'
import CovalentHelper from '@helpers/covalent'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'
import { type ClientSession, type SaveOptions } from 'mongoose'
import TokenDetailProvider from '@providers/tokenDetailProvider/providerFactory'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyToken' })

export const ProxyToken = {
  saveAndGetToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean = false,
  ): Promise<null | Token> => {
    try {
      return await DbTx.executeTxFn(async ({ session }) => {
        const parsedTokenAddress = Web3Helper.parseAddress(tokenAddress) || tokenAddress

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
      const { tokenDetails, tokenMetrics } = await TokenDetailProvider.fetchTokenDetails(network, tokenAddress, {
        type: token.type,
        isGovernance: token.isGovernance,
      })

      updates = {
        priceUsd: tokenDetails.priceUsd,
        priceChangeOnDayUsd: tokenDetails.priceChangeOnDayUsd,
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

  createNewToken: async (tokenAddress: HexAddress, network: NetworksEnum, session?: ClientSession): Promise<Token> => {
    const tokenTypeInfo = await TokenDetector.detectTokenType(tokenAddress, network)
    const { tokenDetails, tokenMetrics } = await TokenDetailProvider.fetchTokenDetails(network, tokenAddress, {
      type: tokenTypeInfo.type,
      isGovernance: tokenTypeInfo.isGovernance,
    })

    const contractDeployInfo =
      tokenTypeInfo.isGovernance || Web3Helper.isWhitelistedToken(tokenAddress, network)
        ? await TokenDetailProvider.fetchContractCreation(tokenAddress, network)
        : { address: tokenAddress, transactionHash: null, blockNumber: 0 }

    const rawTokenRate = {
      ...tokenDetails,
      decimals: tokenDetails.decimals ?? 0,
      logo: tokenDetails.logo || undefined,
    }

    // Construct raw token data
    const rawToken: Partial<Token> = {
      ...rawTokenRate,
      transactionHash: contractDeployInfo.transactionHash,
      blockNumber: contractDeployInfo.blockNumber,
      holders: tokenMetrics.totalHolders,
      totalSupply: tokenMetrics.totalSupply,
      address: tokenAddress,
      underlying: tokenTypeInfo.hasUnderlying ? await Web3Helper.getUnderlying(tokenAddress, network) : null,
      type: tokenTypeInfo.type,
      isGovernance: tokenTypeInfo.isGovernance,
      hasDelegate: tokenTypeInfo.hasDelegate,
      hasBalanceOfERC20: tokenTypeInfo.hasBalanceOfERC20,
      hasBalanceOfERC777: tokenTypeInfo.hasBalanceOfERC777,
      hasName: tokenTypeInfo.hasName,
      hasSymbol: tokenTypeInfo.hasSymbol,
      hasDecimals: tokenTypeInfo.hasDecimals,
      hasTotalSupply: tokenTypeInfo.hasTotalSupply,
      implementationAddress: tokenTypeInfo.implementationAddress! ?? null,
      network,
      lastUpdatedAt: dayjs.utc().toDate(),
      mintableByDao: await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network, session),
      skipFetchRate: ProxyToken.shouldSkipFetch(
        {
          ...tokenDetails,
          holders: tokenMetrics.totalHolders,
          totalSupply: tokenMetrics.totalSupply,
          address: tokenAddress,
          type: tokenTypeInfo.type,
          network,
        },
        tokenDetails,
      ),
    }

    // Ensure correct token type
    if (rawToken.type === ITokenType.unknown && tokenDetails.type !== ITokenType.unknown) {
      rawToken.type = tokenDetails.type
    }

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

  shouldSkipFetch: (token: Partial<Token>, tokenRate: ITokenDetails): boolean =>
    (!token.symbol ||
      token.isGovernance ||
      token.type === ITokenType.unknown ||
      CovalentHelper.skipTestNetworks.includes(token.network!)) &&
    tokenRate.priceUsd === '0',

  analyzeIfScamToken: (name: string, symbol: string): boolean => {
    const regex =
      /^(?=.*(?:https?:\/\/\S+|www\.[a-z0-9-]+\.[a-z]{2,63}|[a-z0-9-]+\.[a-z]{2,63}))(?=.*(?:claim|rewards?|join|stake|swap|voucher|airdrop|bonus|free|giveaway|visit)).+$/i
    const firstCheck = regex.test(name) || regex.test(symbol)
    const secondCheck = regex.test(name + symbol)

    return firstCheck || secondCheck
  },
}
