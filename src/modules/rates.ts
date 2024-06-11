import { ZeroAddress } from 'ethers'
import { type HexAddress, type NetworksEnum } from '@types'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import CovalentHelper from '@helpers/covalent'

export const RateModule = {
  fetchRate: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    priceUsd: string
    priceChangeOnDayUsd: string
    logo: string
    lastUpdatedAt: Date
  }> => {
    return await RateModule.fetchRateWithCoinGecko(tokenAddress, network)
  },

  fetchRateWithCovalent: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    priceUsd: string
    priceChangeOnDayUsd: string
    logo: string
    lastUpdatedAt: Date
  }> => {
    const tokenPrice: any = {
      priceUsd: '0',
      priceChangeOnDayUsd: '0',
      logo: null,
      lastUpdatedAt: null,
    }

    const token = await CovalentHelper.getToken(tokenAddress, network)

    if (token) {
      tokenPrice.priceUsd = token.priceUsd?.toString() ?? '0'
      tokenPrice.priceChangeOnDayUsd = token.priceChangeOnDayUsd?.toString() ?? '0'
      tokenPrice.logo = token.logo
      tokenPrice.lastUpdatedAt = dayjs.utc().toDate()
    }

    return tokenPrice
  },

  fetchRateWithCoinGecko: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    priceUsd: string
    priceChangeOnDayUsd: string
    logo: string
    lastUpdatedAt: Date
  }> => {
    const tokenPrice: any = {
      priceUsd: '0',
      priceChangeOnDayUsd: '0',
      logo: null,
      lastUpdatedAt: null,
    }

    if (tokenAddress === ZeroAddress) {
      const price = await CoinGeckoHelper.getCoinPrice(network)
      if (price) {
        tokenPrice.priceUsd = price.usd.toString()
        tokenPrice.priceChangeOnDayUsd = price.usd24hChange.toString()
        tokenPrice.lastUpdatedAt = dayjs.utc().toDate()
      }
    } else {
      const price = await CoinGeckoHelper.getTokenPrice(tokenAddress, network)
      if (price) {
        tokenPrice.priceUsd = price.usd.toString()
        tokenPrice.priceChangeOnDayUsd = price.usd24hChange.toString()
        tokenPrice.lastUpdatedAt = dayjs.utc().toDate()
      }
    }

    return tokenPrice
  },
}
