import logger from '@logger'
import config from '@config'
import utils from '@helpers/utils'
import { CrawlerErrorType, type IErrorHandlerConfig, type IErrorAnalysis } from '@types'

const llo = logger.logMeta.bind(null, { service: 'modules:CrawlerErrorHandler' })

/**
 * Handles error detection, classification, and recovery strategies for blockchain crawlers
 */
export class CrawlerErrorHandler {
  private readonly config: Required<IErrorHandlerConfig>
  private retryCount = 0

  constructor(config?: IErrorHandlerConfig) {
    this.config = {
      maxRetries: config?.maxRetries ?? 5,
      baseBackoffMs: config?.baseBackoffMs ?? 500,
      maxBackoffMs: config?.maxBackoffMs ?? 10000,
      stopOnError: config?.stopOnError ?? false,
    }
  }

  /**
   * Analyze an error and determine the appropriate response
   */
  analyzeError(error: any): IErrorAnalysis {
    const errorType = this.classifyError(error)
    const shouldRetry = this.shouldRetryError(errorType)
    const backoffMs = shouldRetry ? this.calculateBackoff(errorType) : undefined

    return {
      type: errorType,
      shouldRetry,
      backoffMs,
      message: this.getErrorMessage(error),
    }
  }

  /**
   * Classify the type of error
   */
  classifyError(error: any): CrawlerErrorType {
    if (this.isRateLimited(error)) {
      return CrawlerErrorType.RATE_LIMITED
    }
    if (this.isBatchSizeError(error)) {
      return CrawlerErrorType.BATCH_SIZE_ERROR
    }
    if (this.isNetworkError(error)) {
      return CrawlerErrorType.NETWORK_ERROR
    }
    return CrawlerErrorType.UNKNOWN
  }

  /**
   * Check if error is due to rate limiting
   */
  isRateLimited(error: any): boolean {
    const messages = [
      'Your app has exceeded its compute units per second capacity',
      'Too many requests, reason: call rate limit exhausted',
      'rate limit exceeded',
      'too many requests',
      '429',
    ]

    const errorMessage = this.getErrorMessage(error).toLowerCase()
    return messages.some(msg => errorMessage.includes(msg.toLowerCase()))
  }

  /**
   * Check if error is due to batch size being too large
   */
  isBatchSizeError(error: any): boolean {
    // First check config whitelist for backward compatibility
    const whitelistErrors = config.BLOCKCHAIN_LOG_CRAWLER?.ERROR_BATCH_SIZE || []
    if (whitelistErrors.some(msg => error.message?.includes(msg))) {
      return true
    }

    // Additional batch size error patterns
    const messages = [
      'The query timed out',
      'timeout',
      'eth_getLogs is limited',
      'Response size is larger than 150MB limit',
      'Log response size exceeded',
      'Consider reducing your block range',
      'Query returned more than 1000000 results',
      'Cannot create a string longer',
      'Response is too big',
      'request entity too large',
      'payload too large',
    ]

    const errorMessage = this.getErrorMessage(error).toLowerCase()
    return messages.some(msg => errorMessage.includes(msg.toLowerCase()))
  }

  /**
   * Check if error is a network-related error
   */
  isNetworkError(error: any): boolean {
    const messages = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'network timeout',
      'socket hang up',
      'connect EHOSTUNREACH',
    ]

    const errorMessage = this.getErrorMessage(error).toLowerCase()
    return messages.some(msg => errorMessage.includes(msg.toLowerCase()))
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetryError(errorType: CrawlerErrorType): boolean {
    if (this.config.stopOnError) {
      return false
    }

    switch (errorType) {
      case CrawlerErrorType.RATE_LIMITED:
        return this.retryCount < this.config.maxRetries
      case CrawlerErrorType.NETWORK_ERROR:
        return this.retryCount < this.config.maxRetries
      case CrawlerErrorType.BATCH_SIZE_ERROR:
        return false // Batch size errors require different handling
      default:
        return false
    }
  }

  /**
   * Calculate backoff time based on error type and retry count
   */
  calculateBackoff(errorType: CrawlerErrorType): number {
    let baseBackoff = this.config.baseBackoffMs

    // Different base backoff for different error types
    switch (errorType) {
      case CrawlerErrorType.RATE_LIMITED:
        baseBackoff = Math.max(baseBackoff, 2000) // At least 2 seconds for rate limiting
        break
      case CrawlerErrorType.NETWORK_ERROR:
        baseBackoff = Math.max(baseBackoff, 1000) // At least 1 second for network errors
        break
    }

    // Exponential backoff with jitter
    const exponentialBackoff = baseBackoff * Math.pow(2, this.retryCount)
    const jitter = Math.random() * 0.3 * exponentialBackoff // Add up to 30% jitter
    const totalBackoff = exponentialBackoff + jitter

    return Math.min(totalBackoff, this.config.maxBackoffMs)
  }

  /**
   * Handle an error with appropriate logging and waiting
   */
  async handleError(error: any, context?: any): Promise<void> {
    const analysis = this.analyzeError(error)

    logger.warn(
      'Crawler error detected',
      llo({
        errorType: analysis.type,
        shouldRetry: analysis.shouldRetry,
        backoffMs: analysis.backoffMs,
        retryCount: this.retryCount,
        message: analysis.message,
        ...context,
      }),
    )

    if (analysis.shouldRetry && analysis.backoffMs) {
      await utils.wait(analysis.backoffMs)
      this.retryCount++
    }
  }

  /**
   * Extract error message from various error formats
   */
  private getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error
    }
    if (error?.message) {
      return error.message
    }
    if (error?.error?.message) {
      return error.error.message
    }
    if (error?.response?.data?.error) {
      return error.response.data.error
    }
    return JSON.stringify(error)
  }

  /**
   * Convert various error formats to a proper Error instance
   * This ensures type safety when passing errors to callbacks that expect Error objects
   *
   * @param error - The error in any format (RPC error, string, Error, etc.)
   * @returns A proper Error instance with preserved metadata
   */
  toError(error: any): Error {
    // If it's already an Error instance, return as-is
    if (error instanceof Error) {
      return error
    }

    // Create new Error with extracted message
    const errorMessage = this.getErrorMessage(error)
    const err = new Error(errorMessage)

    // Preserve additional error properties for debugging
    if (error && typeof error === 'object') {
      // Preserve RPC error code if present
      if ('code' in error) {
        ;(err as any).code = error.code
      }
      // Preserve additional data if present
      if ('data' in error) {
        ;(err as any).data = error.data
      }
      // Preserve original error for debugging
      ;(err as any).originalError = error
    }

    return err
  }
}
