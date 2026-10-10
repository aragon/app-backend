import config from '@config'
import { assert } from '@errors'
import Utils from '@helpers/utils'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helpers:RetryRequestHelper' })

interface RetryOptions {
  maxRetries?: number
  retryAll?: boolean
  skipRetry?: (error: any) => boolean
  retryStatuses?: number[]
}

export async function retryRequest<T>(requestFunction: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = config.RETRY_REQUEST.COUNT, retryStatuses = [429, 502] } = options
  const retryDelay = (retryCount: number) => Math.pow(2, retryCount) * 1000

  const waitBeforeRetry = async (attempt: number) => {
    if (attempt + 1 >= maxRetries) return
    await Utils.wait(retryDelay(attempt))
  }

  let retryCount = 0
  let lastError: any

  while (retryCount < maxRetries) {
    try {
      const response: any = await requestFunction()
      if (response?.data?.message === 'NOTOK') {
        assert(false, 'Rate limit', { status: 429, description: 'Rate limit exceeded' })
      }
      return response
    } catch (error: any) {
      lastError = error
      const errorCode = error?.status || error?.response?.status || error?.info?.error?.code
      const willRetry = retryCount + 1 < maxRetries
      const wait = willRetry ? retryDelay(retryCount) : 0
      if (options.skipRetry?.(error)) {
        throw error
      } else if (retryStatuses.includes(errorCode)) {
        logger.warn(
          willRetry ? 'Rate limit exceeded, retrying...' : 'Rate limit exceeded, last attempt failed',
          llo({ retryCount, wait, fn: requestFunction.toString(), error }),
        )
        await waitBeforeRetry(retryCount)
        retryCount++
      } else if (canBeRetried(error)) {
        logger.warn(
          willRetry ? 'ForceRetry, retrying...' : 'ForceRetry, last attempt failed',
          llo({ retryCount, wait, fn: requestFunction.toString(), error }),
        )
        await waitBeforeRetry(retryCount)
        retryCount++
      } else if (isErrorRelatedToServerIssue(error)) {
        logger.warn(
          willRetry ? 'Warn, retrying on upstream server error...' : 'Warn, upstream server error, last attempt failed',
          llo({ retryCount, wait, error }),
        )
        await waitBeforeRetry(retryCount)
        retryCount++
      } else if (serverNotAvailableError(error)) {
        logger.warn(
          willRetry ? 'Server not available, retrying...' : 'Server not available, last attempt failed',
          llo({ retryCount, wait, error }),
        )
        await waitBeforeRetry(retryCount)
        retryCount++
      } else if (options.retryAll) {
        logger.warn(
          willRetry ? 'Unknown error, retrying...' : 'Unknown error, last attempt failed',
          llo({ retryCount, wait, error }),
        )
        await waitBeforeRetry(retryCount)
        retryCount++
      } else {
        error.retryCount = retryCount
        error.expCode = error?.code || error?.code_str || error?.errorCode || error?.error?.code_str || 'unknown'
        throw error
      }
    }
  }

  lastError.retryCount = retryCount
  throw lastError
}

export function serverNotAvailableError(error: any): boolean {
  const whitelistCode = ['SERVER_ERROR', 'TIMEOUT', 'ECONNRESET']
  const errorCode = error?.code || error?.code_str || error?.errorCode || error?.error?.code_str

  return whitelistCode.includes(errorCode)
}

export async function retryResult<T>(fn: () => Promise<T>, retries: number, delay: number): Promise<T | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fn()
      if (result !== undefined && result !== null) {
        return result
      }
      logger.warn(`Retry attempt ${attempt} failed not found`, llo({ attempt }))
    } catch (error) {
      logger.error(`Retry attempt ${attempt} failed due to error:`, llo({ error, attempt }))
    }

    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, delay * attempt))
    }
  }
  return null
}

export function canBeRetried(error: any): boolean {
  return !!error?.reason?.includes('future lookup')
}

export function isErrorRelatedToServerIssue(error: any): boolean {
  try {
    const requestData = error?.config?.data || error?.requestBody
    if (!requestData) return false

    let parsedReqBody: any = null
    try {
      parsedReqBody = JSON.parse(requestData)
    } catch (parseError) {
      logger.warn('Failed to parse request data as JSON', { requestData, parseError })
      return false
    }

    const whitelistMethods = [
      'eth_blockNumber',
      'eth_getBlockByNumber',
      'eth_getBlockReceipts',
      'eth_getTransactionReceipt',
    ]

    const isRequestWhitelisted = (req: any) => {
      const method = req?.method
      const params = req?.params?.[0]
      const isEthGetLogsWithSameBlock = method === 'eth_getLogs' && params?.fromBlock === params?.toBlock
      return isEthGetLogsWithSameBlock || whitelistMethods.includes(method)
    }

    if (Array.isArray(parsedReqBody)) {
      return parsedReqBody.some(isRequestWhitelisted)
    }

    return isRequestWhitelisted(parsedReqBody)
  } catch (e) {
    logger.warn('Error parsing request body for isErrorRelatedToServerIssue', { error, e })
    return false
  }
}
