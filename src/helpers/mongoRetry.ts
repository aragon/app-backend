import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helpers:MongoRetry' })

export interface MongoRetryOptions {
  maxRetries?: number
  retryDelay?: number
  exponentialBackoff?: boolean
  onRetry?: (error: any, attempt: number) => void
  shouldRetry?: (error: any) => boolean
}

const DEFAULT_OPTIONS: Required<Omit<MongoRetryOptions, 'onRetry' | 'shouldRetry'>> = {
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true,
}

const MongoRetryHelper = {
  /**
   * Determines if an error is a MongoDB connection error that should be retried
   */
  isMongoConnectionError(error: any): boolean {
    if (!error) return false

    const errorMessage = error?.message || ''
    const errorName = error?.name || ''

    return (
      errorMessage.includes('Client must be connected') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorName === 'MongoNotConnectedError' ||
      errorName === 'MongoNetworkError' ||
      errorName === 'MongoServerSelectionError'
    )
  },

  /**
   * Execute a MongoDB operation with retry logic for connection errors
   * @param operation - The MongoDB operation to execute
   * @param options - Retry configuration options
   * @returns The result of the operation or null if all retries failed
   */
  async retryOperation<T>(operation: () => Promise<T>, options: MongoRetryOptions = {}): Promise<T | null> {
    const config = { ...DEFAULT_OPTIONS, ...options }
    const shouldRetry = options.shouldRetry || this.isMongoConnectionError

    let lastError: any

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        lastError = error

        if (!shouldRetry(error)) {
          // Non-retryable error, throw immediately
          throw error
        }

        if (attempt === config.maxRetries) {
          // Final attempt failed
          logger.error(
            'MongoDB operation failed after all retries',
            llo({
              attempt,
              maxRetries: config.maxRetries,
              error: error?.message || String(error),
              errorName: error?.name,
            }),
          )
          throw error
        }

        const delay = config.exponentialBackoff ? config.retryDelay * Math.pow(2, attempt - 1) : config.retryDelay

        logger.warn(
          'MongoDB operation failed, retrying...',
          llo({
            attempt,
            maxRetries: config.maxRetries,
            nextRetryIn: delay,
            error: error?.message || String(error),
            errorName: error?.name,
          }),
        )

        if (options.onRetry) {
          options.onRetry(error, attempt)
        }

        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    logger.error(
      'MongoDB operation failed after all retries',
      llo({
        maxRetries: config.maxRetries,
        lastError: lastError?.message || String(lastError),
      }),
    )

    return null
  },

  /**
   * Execute a MongoDB operation with retry logic, but don't throw on failure
   * Useful for non-critical operations like logging or cleanup
   */
  async retryOperationSafe<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: MongoRetryOptions = {},
  ): Promise<T | null> {
    try {
      return await this.retryOperation(operation, options)
    } catch (error: any) {
      logger.error(
        `Failed to execute ${operationName} after retries`,
        llo({
          operationName,
          error: error?.message || String(error),
        }),
      )
      return null
    }
  },

  /**
   * Wraps a MongoDB update operation with retry logic and proper error handling
   */
  async safeUpdate(
    operation: () => Promise<any>,
    context: { taskName?: string; taskRunId?: string; serviceName?: string },
    options: MongoRetryOptions = {},
  ): Promise<boolean> {
    try {
      await this.retryOperation(operation, {
        ...options,
        maxRetries: options.maxRetries || 2,
        retryDelay: options.retryDelay || 500,
      })
      return true
    } catch (error: any) {
      logger.warn(
        'MongoDB update failed',
        llo({
          ...context,
          error: error?.message || String(error),
        }),
      )
      return false
    }
  },
}

export default MongoRetryHelper
