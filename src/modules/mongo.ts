import config from '@config'
import logger from '@logger'
import { assert } from '@errors'
import utils from '@helpers/utils'
import mongoose, {
  type ClientSession,
  type ClientSessionOptions,
  type ConnectOptions,
  type SaveOptions,
} from 'mongoose'
import { retry } from 'ts-retry-promise'
import { ModelProxy } from '@src/models'

const llo = logger.logMeta.bind(null, { service: 'mongo' })

const mongoOptions: ConnectOptions = {
  dbName: config.MONGO_DB.NAME,
  autoIndex: false, // Don't build indexes
  maxPoolSize: 50,
}

const retryOptions = {
  retries: 60,
  timeout: 5000,
  delay: 1000,
}

const Mongo = {
  async connect(): Promise<any> {
    await ModelProxy.setMongoModels()

    mongoose.connection.on('error', (error: Error) => {
      logger.verbose('MongoDB connection error', llo({ error }))
    })

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    mongoose.connection.on('connected', async() => {
      await Promise.all(
        Object.keys(mongoose.models).map(async name => {
          await mongoose.models[name].syncIndexes()
        }),
      )

      logger.info('MongoDB connected', llo({ env: config.NODE_ENV }))
    })

    mongoose.set('debug', config.MONGO_DB.DEBUGGER)

    return await retry(async() => {
      logger.verbose(
        'MongoDB try connecting',
        llo({
          url: config.MONGO_DB.URI,
          name: config.MONGO_DB.NAME,
        }),
      )

      return await mongoose.connect(config.MONGO_DB.URI, mongoOptions)
    }, retryOptions)
  },

  async disconnect(): Promise<void> {
    await mongoose.disconnect()
    logger.verbose('MongoDB disconnect', llo({}))
  },

  async drop() {
    /* eslint-disable no-async-promise-executor */
    return await new Promise(async resolve => {
      await Promise.all(
        Object.keys(mongoose.models).map(async name => {
          await mongoose.models[name].deleteMany()
        }),
      )
      resolve(true)
    })
  },

  isErrorConflict(error: any) {
    return error.message.includes('WriteConflict')
  },

  isErrorNotSupported(error: any) {
    return error.message.includes('Current topology does not support sessions')
  },

  async transactionOptions(): Promise<ClientSession> {
    // eslint-disable-next-line
    return mongoose.connection.startSession({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    } as ClientSessionOptions)
  },

  /*
  ATTENTION
  Last executed call MUST be a transaction.commit in this callback!
  Otherwise, may not detect unattended errors
 */
  async executeTxFn(fn: any): Promise<any> {
    async function tryFn() {
      const session = await Mongo.transactionOptions()

      session.startTransaction()

      const tOpts: SaveOptions = { session }

      try {
        return fn(tOpts)
      } catch (error: any) {
        if (error.hasEnded) {
          throw error
        }

        try {
          await session.abortTransaction()
          await session.endSession()
        } catch (errorRollback) {
          logger.warn(
            'unable to rollback transaction - manual review',
            llo({ error: errorRollback }),
          )
        }

        throw error
      }
    }

    try {
      return await tryFn()
    } catch (error) {
      return await Mongo.handleTxError(error, tryFn)
    }
  },

  async handleTxError(error: any, retryFn: any, i = 0): Promise<any> {
    if (Mongo.isErrorConflict(error)) {
      logger.warn('mongodb concurrent error', llo({ error }))

      assert(
        i < config.MONGO_DB.RETRY_CONCURRENT_INTERVAL,
        'mongodb_concurrent',
        { errorMongoDb: error },
      )

      await utils.wait(
        Math.round(Math.random() * config.MONGO_DB.RETRY_CONCURRENT_TIME) + 100,
      )

      try {
        return retryFn()
      } catch (error) {
        return await Mongo.handleTxError(error, retryFn, ++i)
      }
    } else if (Mongo.isErrorNotSupported(error)) {
      logger.warn(
        'mongodb atomic transaction not supported error',
        llo({ error }),
      )

      throw error
    } else {
      throw error
    }
  },
}

export default Mongo
