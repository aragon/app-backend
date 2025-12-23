import logger from '@logger'
import Utils from '@helpers/utils'
import { assert } from '@errors'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'helpers:RetryRequestHelper' })

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
      const errorCode = error?.status || error?.response?.status || error?.info?.error?.code
      if ([429, 502].includes(errorCode)) {
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
      } else if (isErrorRelatedToServerIssue(error)) {
        logger.warn(
          'Warn, retrying on alchemy server error...',
          llo({ retryCount, wait: retryDelay(retryCount), error }),
        )
        await Utils.wait(retryDelay(retryCount))
        retryCount++
      } else if (serverNotAvailableError(error)) {
        logger.warn('Server not available, retrying...', llo({ retryCount, wait: retryDelay(retryCount), error }))
        await Utils.wait(retryDelay(retryCount))
        retryCount++
      } else {
        error.retryCount = retryCount
        error.expCode = error?.code || error?.code_str || error?.errorCode || error?.error?.code_str || 'unknown'
        throw error
      }
    }
  }

  throw new Error(`Request failed after ${maxRetries} retries`)
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
