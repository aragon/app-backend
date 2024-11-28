import axios from 'axios'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import { NetworksEnum } from '@types'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'Octav' })

const OctavFi = {
  axiosInstance: axios.create({
    baseURL: config.OCTAV.URI,
    headers: {
      'Content-Type': 'application/json',
    },
  }),

  networksMap: {
    [NetworksEnum.polygonMainnet]: 'polygon',
    [NetworksEnum.ethereumMainnet]: 'ethereum',
    [NetworksEnum.baseMainnet]: 'base',
    [NetworksEnum.arbitrumMainnet]: 'arbitrum',
    // [NetworksEnum.ethereumSepolia]: 'sepolia', // testnet networks not available
    [NetworksEnum.zksyncSepolia]: 'zksync-sepolia-testnet',
    [NetworksEnum.zksyncMainnet]: 'zksync-mainnet',
  },

  networkToCovalent: (network: NetworksEnum) => {
    return OctavFi.networksMap[network]
  },

  _rpCall: async <T>(path: string): Promise<T> => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getOctavLimiter(NetworksEnum.ethereumMainnet)!.schedule(async () =>
          OctavFi.axiosInstance.get(`${config.OCTAV.URI}${path}`, {
            headers: {
              Authorization: `Bearer ${config.OCTAV.TOKEN}`,
            },
          }),
        ),
      )

      return response.data
    } catch (error: any) {
      logger.error('Error in Octav RPC Call', llo({ path, error }))
      throw error
    }
  },

  getPortfolio: async (
    address: string,
    includeNFTs = false,
    includeImages = false,
    includeExplorerUrls = false,
  ): Promise<any> => {
    const queryParams = new URLSearchParams({
      addresses: address,
      includeNFTs: includeNFTs.toString(),
      includeImages: includeImages.toString(),
      includeExplorerUrls: includeExplorerUrls.toString(),
    }).toString()

    const path = `/api/rest/portfolio?${queryParams}`

    try {
      const response = await OctavFi._rpCall<any>(path)
      return response
    } catch (error) {
      logger.error('Error fetching portfolio from Octav', llo({ error, address }))
      return undefined
    }
  },
}

export default OctavFi

// const a = {
//   metadata: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 5 },
//   data: [
//     {
//       network: 'ethereum-mainnet',
//       amount: '3737591',
//       dao: { address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', ens: null, avatar: null },
//       token: {
//         network: 'ethereum-mainnet',
//         type: 'ERC20',
//         address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
//         logo: 'https://logos.covalenthq.com/tokens/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
//         name: 'USD Coin',
//         symbol: 'USDC',
//         decimals: 6,
//         priceChangeOnDayUsd: '0.000132000000000021',
//         priceUsd: '1.0004096',
//       },
//       amountUsd: '3.7391219172736',
//     },
//     {
//       network: 'ethereum-mainnet',
//       amount: '498847116275620096',
//       dao: { address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', ens: null, avatar: null },
//       token: {
//         network: 'ethereum-mainnet',
//         type: 'ERC20',
//         address: '0xa117000000f279D81A1D3cc75430fAA017FA5A2e',
//         logo: 'https://logos.covalenthq.com/tokens/1/0xa117000000f279d81a1d3cc75430faa017fa5a2e.png',
//         name: 'Aragon Network Token',
//         symbol: 'ANT',
//         decimals: 18,
//         priceChangeOnDayUsd: '-0.22739779999999987',
//         priceUsd: '1.3327777',
//       },
//       amountUsd: '0.6648523122814535176206592',
//     },
//     {
//       network: 'ethereum-mainnet',
//       amount: '8.0',
//       dao: { address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', ens: null, avatar: null },
//       token: {
//         network: 'ethereum-mainnet',
//         type: 'ERC20',
//         address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
//         logo: 'https://logos.covalenthq.com/tokens/1/0xdac17f958d2ee523a2206206994597c13d831ec7.png',
//         name: 'Tether USD',
//         symbol: 'USDT',
//         decimals: 6,
//         priceChangeOnDayUsd: '0.0014008999999999272',
//         priceUsd: '1.000759',
//       },
//       amountUsd: '0.000008006072',
//     },
//     {
//       network: 'ethereum-mainnet',
//       amount: '0.00491',
//       dao: { address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', ens: null, avatar: null },
//       token: {
//         network: 'ethereum-mainnet',
//         type: 'ERC20',
//         address: '0x0000000000000000000000000000000000000000',
//         logo: 'https://www.datocms-assets.com/86369/1669619533-ethereum.png',
//         name: 'Ether',
//         symbol: 'ETH',
//         decimals: 18,
//         priceChangeOnDayUsd: '85.79959999999983',
//         priceUsd: '3412.252',
//       },
//       amountUsd: '1.675415732E-17',
//     },
//     {
//       network: 'ethereum-mainnet',
//       amount: '1.095812291127984202',
//       dao: { address: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254', ens: null, avatar: null },
//       token: {
//         network: 'ethereum-mainnet',
//         type: 'ERC20',
//         address: '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD',
//         logo: 'https://logos.covalenthq.com/tokens/1/0xa3931d71877c0e7a3148cb7eb4463524fec27fbd.png',
//         name: 'Savings USDS',
//         symbol: 'SUSDS',
//         decimals: 18,
//         priceChangeOnDayUsd: '0',
//         priceUsd: '0',
//       },
//       amountUsd: '0E-36',
//     },
//   ],
// }
