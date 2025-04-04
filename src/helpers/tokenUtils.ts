import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'
import { ITokenType, type ITokenUpdate, type NetworksEnum } from '@types'
import BlockScoutHelper from '@helpers/blockScout'
import CovalentHelper from '@helpers/covalent'
import Web3Helper from '@helpers/web3'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helper:tokenUtils' })

const firstValid = <T>(...values: (T | null | undefined | '0' | 0)[]): T | null => {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== '0' && v !== 0) {
      return v
    }
  }
  return null
}

async function fetchTokenUpdate(token: Token): Promise<ITokenUpdate | null> {
  const [rawRate, blockScoutInfo, covalentInfo] = await Promise.all([
    RateModule.fetchRate(token.address, token.network),
    token.type === ITokenType.native
      ? Promise.resolve(null)
      : BlockScoutHelper.getTokenFullDetails(token.address, token.network),
    CovalentHelper.getTokenSupplyAndHolders(token.address, token.network),
  ])

  if (rawRate?.decimals === null && !blockScoutInfo) {
    return null
  }

  const priceUsd = rawRate?.decimals !== null ? rawRate.priceUsd : blockScoutInfo ? blockScoutInfo.priceUsd : '0'

  const priceChangeOnDayUsd =
    rawRate.decimals !== null && rawRate.priceChangeOnDayUsd !== '0' ? rawRate.priceChangeOnDayUsd : '0'

  const holders =
    firstValid(
      blockScoutInfo ? blockScoutInfo.totalHolders : null,
      ((token.type === ITokenType.ERC20 && token.isGovernance) ||
        Web3Helper.isWhitelistedToken(token.address, token.network)) &&
        covalentInfo
        ? covalentInfo.totalHolders
        : null,
    ) || 0

  const totalSupply =
    firstValid(
      blockScoutInfo ? blockScoutInfo.totalSupply : null,
      ((token.type === ITokenType.ERC20 && token.isGovernance) ||
        Web3Helper.isWhitelistedToken(token.address, token.network)) &&
        covalentInfo
        ? covalentInfo.totalSupply
        : null,
    ) || '0'

  if (priceUsd === '0' && holders === 0 && totalSupply === '0') {
    return null
  }

  return {
    priceUsd,
    priceChangeOnDayUsd,
    holders,
    totalSupply,
  }
}

const isTokenSyncable = async (tokenAddress: string, network: NetworksEnum): Promise<boolean> => {
  try {
    const dbToken = await Models.Token.findOne({ address: tokenAddress, network })
    if (dbToken) return true
    const web3TokenDetails = await Web3Helper.getTokenNameAndSymbol(tokenAddress, network)
    if (web3TokenDetails.name && web3TokenDetails.symbol) {
      return !ProxyToken.analyzeIfScamToken(web3TokenDetails.name, web3TokenDetails.symbol)
    }

    const blockScoutDetails = await BlockScoutHelper.getTokenFullDetails(tokenAddress, network)
    if (blockScoutDetails && blockScoutDetails.type !== ITokenType.unknown) {
      return !ProxyToken.analyzeIfScamToken(blockScoutDetails.name! || '', blockScoutDetails.symbol! || '')
    }
    return false
  } catch (e) {
    logger.error('Error checking if token is syncable', llo({ tokenAddress, network, error: e }))
    return false
  }
}

export default {
  fetchTokenUpdate,
  firstValid,
  isTokenSyncable,
}
