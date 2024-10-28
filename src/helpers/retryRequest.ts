import logger from '@logger'
import Utils from '@helpers/utils'
import { assert } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'RetryRequestHelper' })

interface RetryOptions {
  maxRetries?: number
}

export async function retryRequest<T>(requestFunction: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 10 } = options
  const retryDelay = (retryCount: number) => Math.pow(2, retryCount) * 1000

  let retryCount = 0

  while (retryCount < maxRetries) {
    try {
      const response: any = await requestFunction()
      if (response?.data?.message === 'NOTOK') {
        assert(false, 'Rate limit', { status: 429, description: 'Rate limit exceeded' })
      }
      return response
    } catch (error: any) {
      if (error?.status === 429 || error?.response?.status === 429 || error?.info?.error?.code === 429) {
        logger.warn(
          'Rate limit exceeded, retrying...',
          llo({ retryCount, wait: retryDelay(retryCount), fn: requestFunction.toString(), error }),
        )
        await Utils.wait(retryDelay(retryCount))
        retryCount++
      } else if (
        ['future lookup'].some(reason => error?.reason?.includes(reason)) ||
        ['invalid length for result data', 'invalid length for result data'].includes(error?.message)
      ) {
        logger.warn(
          'ForceRetry, retrying...',
          llo({ retryCount, wait: retryDelay(retryCount), fn: requestFunction.toString(), error }),
        )
        await Utils.wait(retryDelay(retryCount))
        retryCount++
      } else {
        // logger.warn('Error in Retry Request', llo({ error }))
        throw error
      }
    }
  }

  throw new Error(`Request failed after ${maxRetries} retries`)
}
