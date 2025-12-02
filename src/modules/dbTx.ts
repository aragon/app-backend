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
    // Note: codeName is "WriteConflict" (no space), but error message contains "Write conflict" (with space)
    const writeConflictPattern = /Write\s?conflict/i
    return [
      error?.code === 112, // MongoDB WriteConflict error code
      error?.codeName === 'WriteConflict',
      error?.codeName === 'LockTimeout',
      error?.codeName === 'NoSuchTransaction',
      error?.message && writeConflictPattern.test(error.message),
    ].some(Boolean)
  },

  isErrorDuplicateKey(error: any): boolean {
    return [error?.message?.includes('duplicate key error collection'), error?.code === 11000].some(Boolean)
  },

  async executeTxFn(fn: any, options?: { stopRetry?: boolean; throwOnStop?: boolean }) {
    async function tryFn(attempt: number = 0): Promise<any> {
      const session = await DbTx.transactionOptions()
      session.startTransaction()

      try {
        const response = await fn({ session })
        return response
      } catch (error: any) {
        if (options?.stopRetry) {
          if (options?.throwOnStop) throw error
          return
        }

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

        // Check if error is due to transaction already being aborted
        if (error?.message?.includes('Transaction') && error?.message?.includes('aborted')) {
          logger.warn('Transaction was aborted, likely due to timeout or connection issue', llo({ error }))
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
      throw error
    }
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
        if (query?.id) {
          try {
            return await collection.findOne(query) // Fetch the existing document
          } catch (_) {
            return null
          }
        }
        return null
      }
    }
    throw new Error('Unable to extract collection name or key details from duplicate key error.')
  },

  async closeEnd(session: ClientSession) {
    try {
      if (session.inTransaction()) {
        await session.abortTransaction() // Abort only if the transaction is active
      }
    } catch (error) {
      logger.warn('Error aborting transaction', llo({ error }))
    } finally {
      try {
        await session.endSession() // Always end the session
      } catch (error) {
        logger.warn('Error ending session', llo({ error }))
      }
    }
  },

  async safeCommit(session: ClientSession): Promise<void> {
    try {
      if (session.inTransaction()) {
        await session.commitTransaction()
      } else {
        logger.warn('Attempted to commit transaction that is not active', llo({}))
      }
    } catch (error: any) {
      // Handle transaction state errors
      if (error?.message?.includes('Attempted illegal state transition')) {
        logger.warn('Transaction already ended (likely aborted), skipping commit', llo({ error: error?.message }))
        // Don't throw - transaction is already ended
      }
      // Handle duplicate key errors during commit
      else if (DbTx.isErrorDuplicateKey(error)) {
        logger.warn(
          'Duplicate key error during commit, data already exists',
          llo({
            error: error?.message,
            errorCode: error?.code,
          }),
        )
        // Don't throw - the data already exists, which is often acceptable
      }
      // Handle other transaction-related errors
      else if (error?.message?.includes('Transaction') && error?.message?.includes('aborted')) {
        logger.warn('Transaction was aborted', llo({ error: error?.message }))
        // Don't throw - transaction is already aborted
      } else {
        throw error // Re-throw other errors
      }
    }
  },
}

export default DbTx
