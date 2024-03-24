import config from '@config'
import logger from '@logger'
import mongoose, { type ConnectOptions } from 'mongoose'
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
    mongoose.connection.on('connected', async () => {
      await Promise.all(
        Object.keys(mongoose.models).map(async name => {
          await mongoose.models[name].syncIndexes()
        }),
      )

      logger.info('MongoDB connected', llo({ env: config.NODE_ENV }))
    })

    mongoose.set('debug', config.MONGO_DB.DEBUGGER)

    return await retry(async () => {
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
}

export default Mongo
