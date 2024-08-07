import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { type HexAddress, type ITokenRate, ITokenType, type NetworksEnum } from '@types'
import TokenDetector from '@helpers/tokenDetector'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'
import dayjs from '@helpers/dayjs'
import CovalentHelper from '@helpers/covalent'

const logMeta = logger.logMeta.bind(null, { service: 'modules:tokenProxy' })

export const TokenProxy = {
  saveAndGetToken: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    forceUpdate = false,
  ): Promise<null | Token> => {
    const parsedTokenAddress = Web3Helper.parseAddress(tokenAddress) || tokenAddress
    let existingToken = await Models.Token.findExistingLog({ address: parsedTokenAddress, network })

    if (existingToken) {
      const sixHoursAgo = dayjs().subtract(6, 'hours').toDate()
      if ((!existingToken.skipFetchRate && existingToken.lastUpdatedAt < sixHoursAgo) || forceUpdate) {
        existingToken = await TokenProxy.updateTokenMetrics(existingToken, parsedTokenAddress, network)
      }
      return existingToken
    }

    const tokenTypeInfo = await TokenDetector.detectTokenType(parsedTokenAddress, network)
    const tokenMetrics = await TokenProxy.getTokenMetrics(tokenTypeInfo?.type!, parsedTokenAddress, network)
    const rate = await RateModule.fetchRate(parsedTokenAddress, network)

    const rawToken = TokenProxy.constructRawToken(parsedTokenAddress, tokenTypeInfo, tokenMetrics, rate, network)
    rawToken.lastUpdatedAt = dayjs.utc().toDate()

    if (TokenProxy.skipFetchToken(rawToken, rate)) {
      rawToken.skipFetchRate = true
    }

    const token = await DbTx.executeTxFn(
      async ({ session }) => {
        const logDb = await Models.Token.create(rawToken, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Token', logMeta({ logId: logDb.id }))
        return logDb
      },
      { stopRetry: true },
    )

    return token
  },

  updateTokenMetrics: async (existingToken: Token, tokenAddress: HexAddress, network: NetworksEnum): Promise<Token> => {
    const [tokenMetrics, tokenRate] = await Promise.all([
      TokenProxy.getTokenMetrics(existingToken.type, tokenAddress, network),
      RateModule.fetchRate(tokenAddress, network),
    ])

    existingToken.holders = tokenMetrics.totalHolders
    existingToken.totalSupply = tokenMetrics.totalSupply
    existingToken.lastUpdatedAt = dayjs.utc().toDate()

    // Update rate-related fields
    existingToken.priceUsd = tokenRate.priceUsd
    existingToken.priceChangeOnDayUsd = tokenRate.priceChangeOnDayUsd
    // existingToken.name = tokenRate.name ?? existingToken.name
    // existingToken.decimals = tokenRate.decimals ?? existingToken.decimals
    // existingToken.symbol = tokenRate.symbol ?? existingToken.symbol
    // existingToken.logo = tokenRate.logo ?? existingToken.logo

    await existingToken.save()
    logger.verbose('Updated Token Metrics', logMeta({ logId: existingToken.id }))

    return existingToken
  },

  getTokenMetrics: async (tokenType: ITokenType, tokenAddress: HexAddress, network: NetworksEnum) => {
    const base = { totalHolders: 0, totalSupply: '0' }
    if (tokenType === ITokenType.native) {
      return base
    }
    const metrics = await CovalentHelper.getTokenTotalHolders(tokenAddress, network)
    return metrics || base
  },

  constructRawToken: (
    tokenAddress: HexAddress,
    tokenTypeInfo: any,
    tokenMetrics: any,
    tokenRate: ITokenRate,
    network: NetworksEnum,
  ) => {
    return {
      ...tokenRate,
      holders: tokenMetrics.totalHolders,
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
}
