import { type I4ByteApiResponse, NetworksEnum } from '@types'
import config from '@config'
import axios from 'axios'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'

const llo = logger.logMeta.bind(null, { service: 'FourByte' })

const FourByte = {
  axiosInstance: axios.create({
    baseURL: config.FOUR_BYTE.URI,
    headers: {
      'Content-Type': 'application/json',
    },
  }),

  _rpCall: async <T>(path: string): Promise<T> => {
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.get4ByteLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          FourByte.axiosInstance.get(`${config.FOUR_BYTE.URI}${path}`),
        ),
      )

      return response.data
    } catch (error: any) {
      logger.error('Error in 4Byte RPC Call', llo({ path, error }))
      throw error
    }
  },

  getSignatures: async (signature: string): Promise<I4ByteApiResponse | undefined> => {
    const path = `/signatures/?format=json&hex_signature=${signature}`

    try {
      const response = await FourByte._rpCall<I4ByteApiResponse>(path)
      return response
    } catch (error) {
      logger.error('Error FourByte signature', llo({ error, signature }))
      return undefined
    }
  },
}

export default FourByte
