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
    return error?.message?.includes('WriteConflict') || error?.codeName === 'WriteConflict'
  },

  isErrorNotSupported(error: any) {
    return error.message.includes('Current topology does not support sessions')
  },

  async executeTxFn(fn: any) {
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
      return await DbTx.handleTxError(error, tryFn)
    }
  },

  async handleTxError(error: any, retryFn: any, i = 0) {
    if (DbTx.isErrorConflict(error)) {
      logger.warn('mongodb concurrent error', llo({ error }))

      assert(i < config.MONGO_DB.RETRY_CONCURRENT_INTERVAL, 'mongodb_concurrent', {
        errorMongoDb: error,
      })

      await utils.wait(Math.round(Math.random() * config.MONGO_DB.RETRY_CONCURRENT_TIME) + 100)

      try {
        return await retryFn()
      } catch (error) {
        return await DbTx.handleTxError(error, retryFn, ++i)
      }
    } else if (DbTx.isErrorNotSupported(error)) {
      logger.warn('mongodb atomic transaction not supported error', llo({ error }))

      throw error
    } else {
      throw error
    }
  },
}

export default DbTx
