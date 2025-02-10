import type Token from '@models/schema/token'
import { RateModule } from '@modules/rates'
import { ITokenType, type ITokenUpdate } from '@types'
import BlockScoutHelper from '@helpers/blockScout'
import CovalentHelper from '@helpers/covalent'
import Web3Helper from '@helpers/web3'

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

  const priceUsd =
    firstValid(rawRate.decimals !== null ? rawRate.priceUsd : null, blockScoutInfo ? blockScoutInfo.priceUsd : null) ||
    '0'

  const priceChangeOnDayUsd =
    rawRate.decimals !== null && rawRate.priceChangeOnDayUsd !== '0' ? rawRate.priceChangeOnDayUsd : '0'

  const holders =
    firstValid(
      blockScoutInfo ? blockScoutInfo.holders : null,
      (token.type === ITokenType.GovernanceERC20 || Web3Helper.isWhitelistedToken(token.address, token.network)) &&
        covalentInfo
        ? covalentInfo.totalHolders
        : null,
    ) || 0

  const totalSupply =
    firstValid(
      blockScoutInfo ? blockScoutInfo.totalSupply : null,
      (token.type === ITokenType.GovernanceERC20 || Web3Helper.isWhitelistedToken(token.address, token.network)) &&
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

export default {
  fetchTokenUpdate,
  firstValid,
}
