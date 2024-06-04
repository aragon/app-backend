import { ZeroAddress } from 'ethers'
import { HexAddress, type NetworksEnum } from '@types'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from "@helpers/dayjs";

export const RateModule = {
  fetchRate: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    priceUsd: string
    priceChangeOnDayUsd: string
  }> => {
    const tokenPrice = {
      priceUsd: '0',
      priceChangeOnDayUsd: '0',
      lastUpdatedAt: dayjs.utc().toDate(),
    }

    if (tokenAddress === ZeroAddress) {
      const price = await CoinGeckoHelper.getCoinPrice(network)
      if (price) {
        tokenPrice.priceUsd = price.usd.toString()
        tokenPrice.priceChangeOnDayUsd = price.usd24hChange.toString()
      }
    } else {
      const price = await CoinGeckoHelper.getTokenPrice(tokenAddress, network)
      if (price) {
        tokenPrice.priceUsd = price.usd.toString()
        tokenPrice.priceChangeOnDayUsd = price.usd24hChange.toString()
      }
    }

    return tokenPrice
  },
}
