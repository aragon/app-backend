import config from '@config'
import logger from '@logger'
import mongoose, { type ConnectOptions } from 'mongoose'
import { retry } from 'ts-retry-promise'
import { ModelProxy } from '@src/models'

const llo = logger.logMeta.bind(null, { service: 'mongo' })

const mongoOptions: ConnectOptions = {
  dbName: config.MONGO_DB.NAME,
  autoIndex: true, // Don't build indexes
  maxPoolSize: 50,
}

const retryOptions = {
  retries: config.MONGO_DB.CONNECTION_RETRY,
  timeout: config.MONGO_DB.CONNECTION_TIMEOUT,
  delay: config.MONGO_DB.CONNECTION_DELAY,
}

const Mongo = {
  async connect(): Promise<any> {
    await ModelProxy.setMongoModels()

    mongoose.set('debug', config.MONGO_DB.DEBUGGER)

    const connectionPromise = new Promise((resolve, reject) => {
      mongoose.connection.on('error', (error: Error) => {
        logger.warn('MongoDB connection error', llo({ error }))
        reject(error)
      })

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      mongoose.connection.on('connected', async () => {
        try {
          await Promise.all(Object.keys(mongoose.models).map(async name => mongoose.models[name].syncIndexes()))
          logger.info('MongoDB connected', llo({ env: config.NODE_ENV }))
          resolve(mongoose)
        } catch (syncError) {
          reject(syncError)
        }
      })
    })

    return await retry(async () => {
      logger.verbose(
        'MongoDB try connecting',
        llo({
          url: config.MONGO_DB.URI,
          name: config.MONGO_DB.NAME,
        }),
      )

      await mongoose.connect(config.MONGO_DB.URI, mongoOptions)
      return connectionPromise
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
}

export default Mongo
