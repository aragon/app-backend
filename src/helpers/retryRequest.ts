import logger from '@logger'
import Utils from '@helpers/utils'
import { assert } from '@errors'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'RetryRequestHelper' })

interface RetryOptions {
  maxRetries?: number
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
      } else if (['SERVER_ERROR', 'TIMEOUT'].includes(error?.code) && isErrorRelatedToServerIssue(error)) {
        logger.warn(
          'Warn, retrying on alchemy server error...',
          llo({ retryCount, wait: retryDelay(retryCount), error }),
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

export function canBeRetried(error: any): boolean {
  return !!error?.reason?.includes('future lookup')
}

export function isErrorRelatedToServerIssue(error: any): boolean {
  try {
    const parsedReqBody = JSON.parse(error?.requestBody || '{}')
    const method = parsedReqBody?.method
    const params = parsedReqBody?.params?.[0]
    const whitelistMethods = [
      'eth_blockNumber',
      'alchemy_getAssetTransfers',
      'eth_getBlockByNumber',
      'eth_getBlockReceipts',
      'eth_getTransactionReceipt',
    ]

    const isEthGetLogsWithSameBlock = method === 'eth_getLogs' && params?.fromBlock === params?.toBlock
    const isFromWhitelistMethods = whitelistMethods.includes(method)

    return isEthGetLogsWithSameBlock || isFromWhitelistMethods
  } catch (e) {
    logger.warn('Error parsing request body for isErrorRelatedToServerIssue', { error, e })
    return false
  }
}
