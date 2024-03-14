import mongoose, { type ClientSession } from 'mongoose'
import logger from '@logger'
import config from '@config'
import utils from '@helpers/utils'
import { assert } from '@errors'

const llo = logger.logMeta.bind(null, { service: 'DbTx' })

class DbTx {
  session: ClientSession | null = null

  static async transactionOptions(): Promise<ClientSession> {
    const session = await mongoose.startSession({
      defaultTransactionOptions: {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    })
    session.startTransaction()
    return session
  }

  static isErrorConflict(error: any): boolean {
    return error.message.includes('WriteConflict')
  }

  static isErrorNotSupported(error: any): boolean {
    return error.message.includes('Current topology does not support sessions')
  }

  static async handleTxError(
    error: any,
    retryFn: () => Promise<any>,
    attempt = 0,
  ): Promise<any> {
    if (this.isErrorConflict(error)) {
      logger.warn('mongodb concurrent error', llo({ error }))

      assert(
        attempt < config.MONGO_DB.RETRY_CONCURRENT_INTERVAL,
        'mongodb_concurrent',
        { errorMongoDb: error },
      )

      await utils.wait(
        Math.round(Math.random() * config.MONGO_DB.RETRY_CONCURRENT_TIME) + 100,
      )

      return await retryFn()
    } else if (this.isErrorNotSupported(error)) {
      logger.warn(
        'mongodb atomic transaction not supported error',
        llo({ error }),
      )
      throw error
    } else {
      throw error
    }
  }

  async executeTxFn(
    fn: (opts: { session: ClientSession }) => Promise<any>,
  ): Promise<any> {
    try {
      if (!this.session) {
        this.session = await DbTx.transactionOptions()
      }

      const response = await fn({ session: this.session })
      await this.session.commitTransaction()
      return response
    } catch (error) {
      if (this.session && this.session.inTransaction()) {
        await this.session.abortTransaction()
      }
      throw error
    } finally {
      if (this.session) {
        this.session.endSession()
        this.session = null
      }
    }
  }
}

export default DbTx
