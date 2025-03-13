import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import {
  EnumQueueName,
  type HexAddress,
  type IContractDeployInfo,
  type ITokenMetrics,
  type ITokenRate,
  ITokenType,
  type NetworksEnum,
} from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import CovalentHelper from '@helpers/covalent'
import EtherscanHelper from '@helpers/etherscan'
import { ethers } from 'ethers'
import { IPermission } from '@src/types/permission'
import { type ClientSession, type SaveOptions } from 'mongoose'
import RabbitMQHelper from '@helpers/rabbitMQ'
import BlockScoutHelper from '@helpers/blockScout'

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
      logger.error('Error saveAndGetToken', llo({ error, document }))
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
      const { tokenRate, tokenMetrics } = await ProxyToken._fetchTokenDetails(
        token.type,
        token.isGovernance,
        tokenAddress,
        network,
      )

      updates = {
        priceUsd: tokenRate.priceUsd,
        priceChangeOnDayUsd: tokenRate.priceChangeOnDayUsd,
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
    const tokenDetails = await ProxyToken._fetchTokenDetails(
      tokenTypeInfo.type,
      tokenTypeInfo.isGovernance,
      tokenAddress,
      network,
    )
    const { tokenRate, tokenMetrics } = tokenDetails

    const contractDeployInfo =
      tokenTypeInfo.isGovernance || Web3Helper.isWhitelistedToken(tokenAddress, network)
        ? await ProxyToken.getContractCreationInfo(tokenAddress, network)
        : { address: '', transactionHash: null, blockNumber: 0 }

    const rawTokenRate = {
      ...tokenRate,
      decimals: tokenRate.decimals ?? 0,
      logo: tokenRate.logo || '',
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
          ...tokenRate,
          holders: tokenMetrics.totalHolders,
          totalSupply: tokenMetrics.totalSupply,
          address: tokenAddress,
          type: tokenTypeInfo.type,
          network,
        },
        tokenRate,
      ),
    }

    // Ensure correct token type
    if (rawToken.type === ITokenType.unknown && tokenRate.type !== ITokenType.unknown) {
      rawToken.type = tokenRate.type
    }

    // Save token and commit transaction
    const savedToken = await Models.Token.create(rawToken, { session })
    await session?.commitTransaction()
    await session?.endSession()

    logger.verbose('New Token Created', llo({ logId: savedToken.id }))
    return savedToken
  },

  async _fetchTokenDetails(
    tokenType: ITokenType,
    isGovernance: boolean,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ tokenRate: ITokenRate; tokenMetrics: ITokenMetrics }> {
    const tokenRate = await RateModule.fetchRate(tokenAddress, network)
    let tokenMetrics: ITokenMetrics = { totalHolders: 0, totalSupply: '0' }

    if (tokenType === ITokenType.native) {
      return { tokenRate, tokenMetrics }
    }

    // TODO: this should go into fetch rates and eventually rename it to fetchTokenDetails
    const tokenFullDetails = await BlockScoutHelper.getTokenFullDetails(tokenAddress, network)

    if (tokenFullDetails) {
      Object.assign(tokenRate, {
        name: tokenFullDetails.name,
        symbol: tokenFullDetails.symbol,
        decimals: tokenFullDetails.decimals,
        logo: tokenFullDetails.logo,
        type: tokenFullDetails.type,
        priceUsd: tokenFullDetails.priceUsd || tokenRate.priceUsd,
      })
      Object.assign(tokenMetrics, {
        totalHolders: tokenFullDetails.holders,
        totalSupply: tokenFullDetails.totalSupply,
      })
    } else if (isGovernance || Web3Helper.isWhitelistedToken(tokenAddress, network)) {
      tokenMetrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)
    }

    if (tokenType === ITokenType.ERC20 && (tokenRate.decimals === null || !tokenRate.name || !tokenRate.symbol)) {
      const onChainTokenInfo = await Web3Helper.getTokenInfo(tokenAddress, network)
      Object.assign(tokenRate, onChainTokenInfo)
    }

    if (
      (isGovernance || Web3Helper.isWhitelistedToken(tokenAddress, network)) &&
      tokenMetrics.totalHolders === 0 &&
      tokenMetrics.totalSupply === '0'
    ) {
      const totalSupply = await Web3Helper.getTokenTotalSupply(tokenAddress, network)
      tokenMetrics.totalSupply = totalSupply.toString()

      await RabbitMQHelper.sendMessage(EnumQueueName.tokenInfo, {
        id: `token-metrics${tokenAddress}`,
        params: { address: tokenAddress, network },
      })
    }

    return { tokenRate, tokenMetrics }
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

  shouldSkipFetch: (token: Partial<Token>, tokenRate: ITokenRate): boolean =>
    (!token.symbol ||
      token.isGovernance ||
      token.type === ITokenType.unknown ||
      CovalentHelper.skipTestNetworks.includes(token.network!)) &&
    tokenRate.priceUsd === '0',

  getContractCreationInfo: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<IContractDeployInfo> => {
    const contractInfo = await EtherscanHelper.fetchContractCreation({
      contractAddress: tokenAddress,
      network,
    })

    if (contractInfo?.length) {
      const txHash = contractInfo[0].txHash
      const txReceipt = await Web3Helper.getTransaction(txHash, network)
      return {
        blockNumber: txReceipt?.blockNumber || 0,
        transactionHash: txHash,
        address: tokenAddress,
      }
    }

    return { blockNumber: 0, transactionHash: null, address: tokenAddress }
  },

  analyzeIfScamToken: (name: string, symbol: string): boolean => {
    const regex =
      /^(?=.*(?:https?:\/\/\S+|www\.[a-z0-9-]+\.[a-z]{2,63}|[a-z0-9-]+\.[a-z]{2,63}))(?=.*(?:claim|rewards?|join|stake|swap|voucher|airdrop|bonus|free|giveaway|visit)).+$/i
    const firstCheck = regex.test(name) || regex.test(symbol)
    const secondCheck = regex.test(name + symbol)

    return firstCheck || secondCheck
  },
}
