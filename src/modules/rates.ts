import config from '@config'
import CoinGeckoHelper from '@helpers/coinGecko'
import dayjs from '@helpers/dayjs'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import axios from 'axios'

export const RateModule = {
  fetchHistoricalRate: async ({ address, network, symbol, timestamp }) => {
    if (CoinGeckoHelper.isTestNetwork(network)) {
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
