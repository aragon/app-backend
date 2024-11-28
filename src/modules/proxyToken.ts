import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import {
  type HexAddress,
  type ITokenInfo,
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

const llo = logger.logMeta.bind(null, { service: 'modules:ProxyToken' })

export const ProxyToken = {
  saveAndGetToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate = false,
  ): Promise<null | Token> => {
    const parsedTokenAddress = Web3Helper.parseAddress(tokenAddress) || tokenAddress
    let existingToken = await Models.Token.findExistingLog({ address: parsedTokenAddress, network })

    if (existingToken) {
      const sixHoursAgo = dayjs().subtract(6, 'hours').toDate()
      if (
        (!existingToken.skipFetchRate && existingToken.lastUpdatedAt < sixHoursAgo) ||
        existingToken.totalSupply === '0' || // update if total supply is 0
        existingToken.holders === 0 || // update if holders is 0
        forceUpdate
      ) {
        existingToken = await ProxyToken.updateTokenMetrics(existingToken, parsedTokenAddress, network)
      }
      return existingToken
    }

    const tokenTypeInfo = await TokenDetector.detectTokenType(parsedTokenAddress, network)
    const tokenMetrics = await ProxyToken.getTokenMetrics(tokenTypeInfo?.type!, parsedTokenAddress, network)
    const tokenRate = await RateModule.fetchRate(parsedTokenAddress, network)

    // this slow down a lot due to the rate limiting of etherscan
    const contractDeployInfo =
      tokenTypeInfo?.type === ITokenType.GovernanceERC20
        ? await ProxyToken.getContractCreationInfo(parsedTokenAddress, network)
        : null

    const rawToken: Partial<Token> = ProxyToken.constructRawToken(
      parsedTokenAddress,
      tokenTypeInfo!,
      tokenMetrics,
      tokenRate,
      network,
    )
    rawToken.lastUpdatedAt = dayjs.utc().toDate()

    if (ProxyToken.skipFetchToken(rawToken, tokenRate)) {
      rawToken.skipFetchRate = true
    }

    if (rawToken.type === ITokenType.unknown && tokenRate.type !== ITokenType.unknown) {
      rawToken.type = tokenRate.type
    }

    if (contractDeployInfo) {
      rawToken.blockNumber = contractDeployInfo.blockNumber
      rawToken.transactionHash = contractDeployInfo?.txHash
    }

    const token = await DbTx.executeTxFn(
      async ({ session }) => {
        const logDb = await Models.Token.create(rawToken, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Token', llo({ logId: logDb.id }))
        return logDb
      },
      { stopRetry: true },
    )

    return token
  },

  updateTokenMetrics: async (existingToken: Token, tokenAddress: HexAddress, network: NetworksEnum): Promise<Token> => {
    const [tokenMetrics, tokenRate] = await Promise.all([
      ProxyToken.getTokenMetrics(existingToken.type, tokenAddress, network),
      RateModule.fetchRate(tokenAddress, network),
    ])

    existingToken.holders = tokenMetrics.totalHolders
    existingToken.totalSupply = tokenMetrics.totalSupply
    existingToken.lastUpdatedAt = dayjs.utc().toDate()

    if (existingToken.totalSupply === '0') {
      existingToken.totalSupply = await Web3Helper.getTokenTotalSupply(existingToken.address, existingToken.network)
    }

    // Update rate-related fields
    existingToken.priceUsd = tokenRate.priceUsd
    existingToken.priceChangeOnDayUsd = tokenRate.priceChangeOnDayUsd
    // existingToken.name = tokenRate.name ?? existingToken.name
    // existingToken.decimals = tokenRate.decimals ?? existingToken.decimals
    // existingToken.symbol = tokenRate.symbol ?? existingToken.symbol
    // existingToken.logo = tokenRate.logo ?? existingToken.logo

    await existingToken.save()
    logger.verbose('Updated Token Metrics', llo({ logId: existingToken.id }))

    return existingToken
  },

  getTokenMetrics: async (
    tokenType: ITokenType,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<ITokenMetrics> => {
    const base = { totalHolders: 0, totalSupply: '0' }
    if (tokenType === ITokenType.native) {
      return base
    }
    const metrics = await CovalentHelper.getTokenInfo(tokenAddress, network)
    return metrics || base
  },

  constructRawToken: (
    tokenAddress: HexAddress,
    tokenTypeInfo: ITokenInfo,
    tokenMetrics: ITokenMetrics,
    tokenRate: ITokenRate,
    network: NetworksEnum,
  ) => {
    return {
      ...tokenRate,
      holders: tokenMetrics?.totalHolders,
      totalSupply: tokenMetrics.totalSupply,
      address: tokenAddress,
      type: tokenTypeInfo?.type,
      implementationAddress: tokenTypeInfo?.implementationAddress!,
      network,
    }
  },

  skipFetchToken: (token: Partial<Token>, tokenRate: ITokenRate): boolean => {
    return (
      (!token.symbol ||
        token.type === ITokenType.GovernanceERC20 ||
        token.type === ITokenType.unknown ||
        CovalentHelper.skipTestNetworks.includes(token?.network!)) &&
      tokenRate.priceUsd === '0'
    )
  },

  getContractCreationInfo: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ txHash: HexAddress | null; address: HexAddress; blockNumber: number }> => {
    const result = {
      blockNumber: 0,
      txHash: null,
      address: tokenAddress,
    }
    const contractInfo = (await EtherscanHelper.fetchContractCreation({
      contractAddress: tokenAddress,
      network,
    })) as any

    if (contractInfo && contractInfo.length > 0) {
      result.txHash = contractInfo[0].txHash!
      const txReceipt = await Web3Helper.getTransaction(contractInfo[0].txHash, network)

      if (txReceipt) {
        result.blockNumber = txReceipt.blockNumber!
      }
    }
    return result
  },
}
