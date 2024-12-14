import logger from '@logger'
import Utils from '@helpers/utils'
import { assert } from '@errors'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'RetryRequestHelper' })

interface RetryOptions {
  maxRetries?: number
}

enum RETRY_REVERTS {
  ERROR_SIG = '0x08c379a0',
}

export async function retryRequest<T>(requestFunction: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = config.RETRY_REQUEST.COUNT } = options
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
      } else if (error?.code === 'SERVER_ERROR' && isErrorRelatedToRealtime(error)) {
        logger.warn(
          'Warn, retrying on alchemy server error...',
          llo({ retryCount, wait: retryDelay(retryCount), error }),
        )
        await Utils.wait(retryDelay(retryCount))
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

function isErrorRelatedToRealtime(error: any): boolean {
  try {
    const parsedReqBody = JSON.parse(error?.requestBody || '{}')
    return (
      parsedReqBody?.method === 'eth_getLogs' &&
      parsedReqBody?.params?.[0]?.fromBlock === parsedReqBody?.params?.[0]?.toBlock
    )
  } catch (e) {
    logger.warn('Error parsing request body for isErrorRelatedToRealtime when alchemy server error', { error, e })
    return false
  }
}
