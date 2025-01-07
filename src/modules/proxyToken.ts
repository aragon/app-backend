import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { type HexAddress, type ITokenMetrics, type ITokenRate, ITokenType, type NetworksEnum } from '@types'
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
    forceUpdate = false,
  ): Promise<null | Token> => {
    const parsedTokenAddress = Web3Helper.parseAddress(tokenAddress) || tokenAddress

    // Check for existing token
    const existingToken = await Models.Token.findExistingLog({
      address: parsedTokenAddress,
      network,
    })

    if (existingToken) {
      return ProxyToken.updateTokenMetrics(existingToken, parsedTokenAddress, network, forceUpdate)
    }

    // Create a new token
    return await ProxyToken.createNewToken(parsedTokenAddress, network)
  },

  updateTokenMetrics: async (
    token: Token,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate: boolean,
  ): Promise<Token> => {
    const shouldUpdate = !token.skipFetchRate && token.lastUpdatedAt < dayjs().subtract(6, 'hours').toDate()

    if (shouldUpdate || forceUpdate) {
      const tokenRate = await RateModule.fetchRate(tokenAddress, network)
      Object.assign(token, {
        priceUsd: tokenRate.priceUsd,
        priceChangeOnDayUsd: tokenRate.priceChangeOnDayUsd,
      })

      if (token.type === ITokenType.GovernanceERC20) {
        const metrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)
        Object.assign(token, {
          holders: metrics.totalHolders,
          totalSupply: metrics.totalSupply,
          lastUpdatedAt: dayjs.utc().toDate(),
        })
      }

      await token.save()
      logger.verbose('Updated Token Metrics', llo({ logId: token.id }))
    }

    return token
  },

  createNewToken: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<Token> => {
    const tokenTypeInfo = await TokenDetector.detectTokenType(tokenAddress, network)
    const tokenRate = await RateModule.fetchRate(tokenAddress, network)
    const contractDeployInfo = await ProxyToken.getContractCreationInfo(tokenAddress, network)

    let tokenMetrics: ITokenMetrics = { totalHolders: 0, totalSupply: '0' }

    if (tokenTypeInfo?.type === ITokenType.GovernanceERC20) {
      tokenMetrics = await CovalentHelper.getTokenSupplyAndHolders(tokenAddress, network)
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

    rawToken.mintableByDao = await ProxyToken.checkPluginMintAuthorizationIsDao(tokenAddress, network)

    return DbTx.executeTxFn(async ({ session }) => {
      const savedToken = await Models.Token.create(rawToken, { session })
      await session.commitTransaction()
      logger.verbose('New Token Created', llo({ logId: savedToken.id }))
      return savedToken
    })
  },

  checkPluginMintAuthorizationIsDao: async (tokenAddress: HexAddress, network: NetworksEnum): Promise<boolean> => {
    const plugin = await Models.Plugin.findByTokenAddress(tokenAddress, network)
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
