import { type HexAddress, type ITokenRate, ITokenType, type NetworksEnum } from '@types'
import dayjs from '@helpers/dayjs'
import CovalentHelper from '@helpers/covalent'

export const RateModule = {
  fetchRate: async (tokenAddress: HexAddress, network: NetworksEnum, pastDays?: number): Promise<ITokenRate> => {
    return await RateModule.fetchRateWithCovalent(tokenAddress, network, pastDays)
  },

  fetchRateWithCovalent: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    pastDays?: number,
  ): Promise<ITokenRate> => {
    const tokenRate: any = {
      address: tokenAddress,
      decimals: null,
      name: null,
      symbol: null,
      priceUsd: '0',
      priceChangeOnDayUsd: '0',
      type: ITokenType.unknown,
      logo: null,
      lastUpdatedAt: null,
    }

    const token = await CovalentHelper.getToken(tokenAddress, network, pastDays)

    if (token) {
      tokenRate.priceUsd = token.priceUsd?.toString() ?? '0'
      tokenRate.priceChangeOnDayUsd = token.priceChangeOnDayUsd?.toString() ?? '0'
      tokenRate.decimals = token.decimals
      tokenRate.symbol = token.symbol
      tokenRate.name = token.name
      tokenRate.logo = token.logo
      tokenRate.type = token.type
      tokenRate.lastUpdatedAt = dayjs.utc().toDate()
    }

    return tokenRate
  },
}
