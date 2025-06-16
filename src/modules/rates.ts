import { type HexAddress, type ITokenRate, ITokenType, type NetworksEnum } from '@types'
import dayjs from '@helpers/dayjs'
import CovalentHelper from '@helpers/covalent'
import axios from 'axios'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'

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
      type: ITokenType.unknown,
      logo: null,
      lastUpdatedAt: null,
    }

    const token = await CovalentHelper.getToken(tokenAddress, network, pastDays)

    if (token) {
      tokenRate.priceUsd = token.priceUsd?.toString() ?? '0'
      tokenRate.decimals = token.decimals
      tokenRate.symbol = token.symbol
      tokenRate.name = token.name
      tokenRate.logo = token.logo
      tokenRate.type = token.type
      tokenRate.lastUpdatedAt = dayjs.utc().toDate()
    }

    return tokenRate
  },

  fetchHistoricalRate: async ({ address, network, symbol, timestamp }) => {
    if (CovalentHelper.skipTestNetworks[network]) {
      return '0'
    }

    const beforeDate = dayjs.unix(timestamp).utc().subtract(1, 'day').unix()
    const url = `${config.ALCHEMY_PRICE_API.URI}/${config.ALCHEMY_PRICE_API.API_KEY}/tokens/historical`

    const params = {
      startTime: beforeDate,
      endTime: timestamp,
      ...(address ? { address, network: ProviderModule.alchemyNetworksMap[network] } : { symbol }),
    }

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }

    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () => axios.post(url, params, requestConfig)),
      )

      return response?.data?.data?.[0]?.value?.toString() || '0'
    } catch (_error: any) {
      return '0'
    }
  },
}
