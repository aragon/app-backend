import mongoose, { type ClientSession } from 'mongoose'
import logger from '@logger'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'DbTx' })

const DbTx = {
  async transactionOptions(): Promise<ClientSession> {
    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    })
    return session
  },

  isErrorConflict(error: any): boolean {
    return [
      error?.message?.includes('WriteConflict'),
      error?.codeName === 'WriteConflict',
      error?.codeName === 'LockTimeout',
    ].some(Boolean)
  },

  isErrorDuplicateKey(error: any): boolean {
    return [error?.message?.includes('duplicate key error collection'), error?.code === 11000].some(Boolean)
  },

  async executeTxFn(fn: any, options?: { stopRetry?: boolean; throwOnStop?: boolean }) {
    async function tryFn(attempt: number = 0): Promise<any> {
      const session = await DbTx.transactionOptions()
      session.startTransaction()
      const tOpts = { session }

      try {
        const response = await fn(tOpts)
        return response
      } catch (error) {
        if (DbTx.isErrorDuplicateKey(error)) {
          const existingDoc = await DbTx.fetchExistingDocument(error)
          return existingDoc
        }

        if (DbTx.isErrorConflict(error)) {
          await DbTx.closeEnd(session)
          const maxRetries = config.MONGO_DB.RETRY_CONCURRENT_INTERVAL
          if (attempt < maxRetries) {
            return await tryFn(attempt + 1) // Retry the operation
          } else {
            logger.error('Exceeded retry attempts for WriteConflict', llo({ error, attempt }))
            throw new Error('Exceeded retry attempts for MongoDB transaction.')
          }
        }

        await DbTx.closeEnd(session)
        throw error
      } finally {
        await DbTx.closeEnd(session)
      }
    }

    try {
      return await tryFn()
    } catch (error) {
      if (options?.stopRetry) {
        if (options?.throwOnStop) throw error
        return
      }
      return await DbTx.handleTxError(error, async () => tryFn())
    }
  },

  async handleTxError(error: any, retryFn: any, attempt = 0): Promise<any> {
    if (DbTx.isErrorConflict(error)) {
      const maxRetries = config.MONGO_DB.RETRY_CONCURRENT_INTERVAL
      if (attempt < maxRetries) {
        try {
          return await retryFn(attempt + 1) // Retry logic
        } catch (retryError) {
          return await DbTx.handleTxError(retryError, retryFn, attempt + 1) // Recursive handling
        }
      } else {
        logger.error('Exceeded retry attempts for WriteConflict', llo({ error, attempt }))
        throw new Error('Exceeded retry attempts for MongoDB transaction.')
      }
    }

    if (DbTx.isErrorDuplicateKey(error)) {
      const existingDoc = await DbTx.fetchExistingDocument(error)
      return existingDoc
    }

    logger.warn('Unhandled error after all retry attempts.', llo({ error, attempt }))
    throw error
  },

  async fetchExistingDocument(error: any) {
    // Check if the error contains a keyValue and message field
    if (error?.keyValue && error?.message) {
      // Extract the collection name from the error message
      const match = error.message.match(/collection: ([\w-]+\.[\w-]+)/)
      if (match) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, fullCollectionName] = match // Extract full collection name (e.g., db-aragon.Transaction)
        const collectionName = fullCollectionName.split('.')[1] // Extract only the collection part
        const collection = mongoose.connection.collection(collectionName)
        const query = error.keyValue // Use the keyValue from the error for the query
        return await collection.findOne(query) // Fetch the existing document
      }
    }
    throw new Error('Unable to extract collection name or key details from duplicate key error.')
  },

  async closeEnd(session: ClientSession) {
    try {
      if (session.inTransaction()) {
        await session.abortTransaction()
      }
    } catch (_) {}

    try {
      await session.endSession()
    } catch (_) {}
  },
}

export default DbTx
