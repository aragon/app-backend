import mongoose, { type ClientSession } from 'mongoose'
import logger from '@logger'
import config from '@config'
import utils from '@helpers/utils'
import { assert } from '@errors'

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

  isErrorConflict(error: any) {
    return (
      error?.message?.includes('WriteConflict') ||
      error?.codeName === 'WriteConflict' ||
      error?.codeName === 'LockTimeout'
    )
  },

  isErrorNotSupported(error: any) {
    return error.message.includes('Current topology does not support sessions')
  },

  isErrorDuplicateKey(error: any) {
    return error.message.includes('duplicate key error collection')
  },

  async executeTxFn(fn: any, options?: { stopRetry?: boolean; throwOnStop?: boolean }) {
    async function tryFn() {
      const session = await DbTx.transactionOptions()

      session.startTransaction()

      const tOpts = { session }

      try {
        const response = await fn(tOpts)
        return response
      } catch (error) {
        // if (error.hasEnded) {
        //   throw error;
        // }

        try {
          await session.abortTransaction()
          await session.endSession()
        } catch (errorRollback) {
          logger.warn('unable to rollback transaction', llo({ error: errorRollback }))
        }

        throw error
      }
    }

    try {
      const response = await tryFn()
      return response
    } catch (error) {
      if (options?.stopRetry) {
        if (options?.throwOnStop) {
          throw error
        }
        return
      }
      return await DbTx.handleTxError(error, tryFn)
    }
  },

  async handleTxError(error: any, retryFn: any, i = 0) {
    if (DbTx.isErrorConflict(error)) {
      assert(i < config.MONGO_DB.RETRY_CONCURRENT_INTERVAL, 'mongodb_concurrent', {
        errorMongoDb: error,
      })

      await utils.wait(Math.round(Math.random() * config.MONGO_DB.RETRY_CONCURRENT_TIME) + 100)

      try {
        return await retryFn()
      } catch (error) {
        const index = i++
        logger.error('atomic transaction retry', llo({ error, index }))
        return await DbTx.handleTxError(error, retryFn, index)
      }
    } else if (DbTx.isErrorNotSupported(error)) {
      logger.error('error atomic transaction not supported', llo({ error, index: i }))
      throw error
    } else if (DbTx.isErrorDuplicateKey(error)) {
      logger.error('Duplicate key error', llo({ error, index: i }))
    } else {
      logger.error('error after all retry', llo({ error, index: i }))
      throw error
    }
  },
}

export default DbTx
