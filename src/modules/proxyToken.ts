import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import {
  EnumQueueName,
  type HexAddress,
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
import { RabbitMQHelper } from '@helpers/radditMQ'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyToken' })

interface ContractDeployInfo {
  blockNumber: number
  transactionHash: HexAddress | null
  address: HexAddress
}

export const ProxyToken = {
  saveAndGetToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean = false,
  ): Promise<null | Token> => {
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
  },

  updateTokenMetrics: async (
    token: Token,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean,
    session?: ClientSession,
  ): Promise<Token> => {
    const shouldUpdate = !token.skipFetchRate && token.lastUpdatedAt < dayjs().subtract(6, 'hours').toDate()
    const updates: any = {}

    if (shouldUpdate || forceUpdate) {
      const tokenRate = await RateModule.fetchRate(tokenAddress, network)
      updates.priceUsd = tokenRate.priceUsd
      updates.priceChangeOnDayUsd = tokenRate.priceChangeOnDayUsd

      if (token.type === ITokenType.GovernanceERC20 || Web3Helper.isWhitelistedToken(token.address, token.network)) {
        const metrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)

        if (
          token.type === ITokenType.GovernanceERC20 &&
          metrics.totalHolders === 0 &&
          metrics.totalSupply === '0' &&
          tokenAddress !== utils.zeroAddress
        ) {
          metrics.totalSupply = await Web3Helper.getTokenTotalSupply(tokenAddress, network)
          if (metrics.totalSupply !== '0') {
            await RabbitMQHelper.sendMessage(EnumQueueName.tokenInfo, {
              id: `token-metrics${tokenAddress}`,
              params: { address: tokenAddress, network },
            })
          }
        }

        updates.holders = metrics.totalHolders
        updates.totalSupply = metrics.totalSupply
        updates.lastUpdatedAt = dayjs.utc().toDate()
      }

      await token.update(updates, { session })
      if (session) {
        await session.commitTransaction()
      }
      logger.verbose('Updated Token Metrics', llo({ logId: token.id }))
    }

    return token
  },

  createNewToken: async (tokenAddress: HexAddress, network: NetworksEnum, session?: ClientSession): Promise<Token> => {
    const tokenTypeInfo = await TokenDetector.detectTokenType(tokenAddress, network)
    const tokenRate = await RateModule.fetchRate(tokenAddress, network)

    let tokenMetrics: ITokenMetrics = { totalHolders: 0, totalSupply: '0' }
    let contractDeployInfo: any = { transactionHash: null, blockNumber: 0 }

    if (tokenTypeInfo?.type === ITokenType.GovernanceERC20 || Web3Helper.isWhitelistedToken(tokenAddress, network)) {
      tokenMetrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)
      contractDeployInfo = await ProxyToken.getContractCreationInfo(tokenAddress, network)

      if (
        tokenTypeInfo?.type === ITokenType.GovernanceERC20 &&
        tokenMetrics.totalHolders === 0 &&
        tokenMetrics.totalSupply === '0' &&
        tokenAddress !== utils.zeroAddress
      ) {
        tokenMetrics.totalSupply = await Web3Helper.getTokenTotalSupply(tokenAddress, network)
        if (tokenMetrics.totalSupply !== '0') {
          await RabbitMQHelper.sendMessage(EnumQueueName.tokenInfo, {
            id: `token-metrics${tokenAddress}`,
            params: { address: tokenAddress, network },
          })
        }
      }
    }

    const rawToken: Partial<Token> = {
      ...tokenRate,
      transactionHash: contractDeployInfo.transactionHash,
      blockNumber: contractDeployInfo.blockNumber,
      holders: tokenMetrics.totalHolders,
      totalSupply: tokenMetrics.totalSupply,
      address: tokenAddress,
      type: tokenTypeInfo?.type || ITokenType.unknown,
      implementationAddress: tokenTypeInfo?.implementationAddress!,
      network,
      lastUpdatedAt: dayjs.utc().toDate(),
      mintableByDao: await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network, session),
      skipFetchRate: ProxyToken.shouldSkipFetch(
        {
          ...tokenRate,
          holders: tokenMetrics.totalHolders,
          totalSupply: tokenMetrics.totalSupply,
          address: tokenAddress,
          type: tokenTypeInfo?.type || ITokenType.unknown,
          network,
        },
        tokenRate,
      ),
    }

    if (rawToken.type === ITokenType.unknown && tokenRate.type !== ITokenType.unknown) {
      rawToken.type = tokenRate.type
    }

    const savedToken = await Models.Token.create(rawToken, { session })
    await session!.commitTransaction()
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

  shouldSkipFetch: (token: Partial<Token>, tokenRate: ITokenRate): boolean =>
    (!token.symbol ||
      token.type === ITokenType.GovernanceERC20 ||
      token.type === ITokenType.unknown ||
      CovalentHelper.skipTestNetworks.includes(token.network!)) &&
    tokenRate.priceUsd === '0',

  getContractCreationInfo: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<ContractDeployInfo> => {
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
}
