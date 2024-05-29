import logger from '@logger'
import axios from 'axios'
import config from '@config'
import { HexAddress } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:DuneHelper' })

interface WalletBalanceResponse {
  request_time: string;
  response_time: string;
  wallet_address: string;
  balances: Balance[];
}

interface Balance {
  chain: string;
  chain_id: number;
  address: HexAddress | string;
  amount: string;
  symbol?: string;
  decimals?: number;
  price_usd?: number;
  value_usd?: number;
}

// Dune only supports: base, polygon, ethereum, arbitrum
const DuneHelper = {
  axiosInstance: axios.create({
    baseURL: config.DUNE.URI,
    headers: { 'Content-Type': 'application/json', 'X-DUNE-API-KEY': config.DUNE.API_KEY },
  }),

  _rpCall: async (path: string) => {
    try {
      const url = `${path}`
      const response = await DuneHelper.axiosInstance(url)
      return response
    } catch (error) {
      logger.error('Error in DuneHelper RPC Call', llo({ error }))
      throw error
    }
  },

  getBalance: async (address: HexAddress): Promise<WalletBalanceResponse> => {
    const resp = await DuneHelper._rpCall(`/beta/balance/${address}`)
    return resp.data
  },
}

export default DuneHelper
