import logger from '@logger'
import Utils from '@helpers/utils'
import { assert } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'RetryRequestHelper' })

interface RetryOptions {
  maxRetries?: number
}

enum RETRY_REVERTS {
  ERROR_SIG = '0x08c379a0',
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
      } else if (canBeRetried(error)) {
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

function canBeRetried(error: any): boolean {
  if (error?.reason?.includes('future lookup')) {
    return true
  }

  if (error?.code === 'CALL_EXCEPTION') {
    return false
  }

  const errorValueSig = error?.value?.slice(0, 10)

  return Object.values(RETRY_REVERTS).includes(errorValueSig)
}
