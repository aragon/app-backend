import config from '@config'
import logger from '@logger'
import { ModelProxy } from '@src/models'
import { type IOptionService } from '@types'
import mongoose, { type ConnectOptions } from 'mongoose'
import { retry } from 'ts-retry-promise'

const llo = logger.logMeta.bind(null, { service: 'mongo' })

const mongoOptions: ConnectOptions = {
  dbName: config.MONGO_DB.NAME,
  autoIndex: false, // Disable automatic index creation
  maxPoolSize: 50,
}

const retryOptions = {
  retries: config.MONGO_DB.CONNECTION_RETRY,
  timeout: config.MONGO_DB.CONNECTION_TIMEOUT,
  delay: config.MONGO_DB.CONNECTION_DELAY,
}

const Mongo = {
  async connect(options?: IOptionService): Promise<any> {
    await ModelProxy.setMongoModels()

    mongoose.set('debug', config.MONGO_DB.DEBUGGER)

    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      logger.verbose(
        'MongoDB already connected',
        llo({
          currentHost: mongoose.connection.host,
          currentDb: mongoose.connection.name,
        }),
      )

      // If already connected and mongoSync is requested, sync indexes
      if (options?.mongoSync) {
        await Mongo.syncIndexes()
      }

      return mongoose
    }

    // Check if connecting
    if (mongoose.connection.readyState === 2) {
      logger.verbose('MongoDB connection already in progress', llo({}))
      // Wait for connection to complete
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MongoDB connection timeout while waiting for existing connection'))
        }, retryOptions.timeout)

        mongoose.connection.once('connected', async () => {
          clearTimeout(timeout)
          try {
            if (options?.mongoSync) {
              await Mongo.syncIndexes()
            }
            resolve(mongoose)
          } catch (syncError) {
            reject(syncError)
          }
        })

        mongoose.connection.once('error', error => {
          clearTimeout(timeout)
          reject(error)
        })
      })
    }

    // Remove all existing listeners to avoid duplicates
    mongoose.connection.removeAllListeners('error')
    mongoose.connection.removeAllListeners('connected')
    mongoose.connection.removeAllListeners('disconnected')

    const connectionPromise = new Promise((resolve, reject) => {
      let resolved = false

      const errorHandler = (error: Error) => {
        if (!resolved) {
          resolved = true
          logger.warn('MongoDB connection error', llo({ error }))
          reject(error)
        }
      }

      const connectedHandler = async () => {
        if (!resolved) {
          resolved = true
          try {
            if (options?.mongoSync) {
              await Mongo.syncIndexes()
            }
            logger.info(
              'MongoDB connected',
              llo({
                env: config.NODE_ENV,
                syncIndexes: options?.mongoSync || false,
              }),
            )
            resolve(mongoose)
          } catch (syncError) {
            reject(syncError)
          }
        }
      }

      mongoose.connection.on('error', errorHandler)
      mongoose.connection.on('connected', connectedHandler)
    })

    return await retry(async () => {
      logger.verbose(
        'MongoDB try connecting',
        llo({
          url: config.MONGO_DB.URI,
          name: config.MONGO_DB.NAME,
          syncIndexes: options?.mongoSync || false,
        }),
      )

      // If disconnecting, wait for it to complete
      if (mongoose.connection.readyState === 3) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      await mongoose.connect(config.MONGO_DB.URI, mongoOptions)
      return connectionPromise
    }, retryOptions)
  },

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState === 0) {
      logger.verbose('MongoDB already disconnected', llo({}))
      return
    }

    await mongoose.disconnect()
    logger.verbose('MongoDB disconnect', llo({}))
  },

  async syncIndexes(): Promise<void> {
    try {
      const start = Date.now()
      const models = Object.keys(mongoose.models)

      logger.info('Starting index synchronization', llo({ modelCount: models.length }))

      const results = await Promise.all(
        models.map(async name => {
          try {
            await mongoose.models[name].syncIndexes()
            return { model: name, status: 'success' }
          } catch (error) {
            logger.error('Failed to sync indexes for model', llo({ model: name, error }))
            return { model: name, status: 'failed', error }
          }
        }),
      )

      const duration = Date.now() - start
      const failed = results.filter(r => r.status === 'failed')

      if (failed.length > 0) {
        throw new Error(`Index sync failed for models: ${failed.map(f => f.model).join(', ')}`)
      }

      logger.info(
        'MongoDB index synchronization completed',
        llo({
          duration,
          modelsSync: results.length,
        }),
      )
    } catch (error) {
      logger.error('MongoDB syncIndexes failed', llo({ error }))
      throw error
    }
  },

  async drop() {
    const models = Object.keys(mongoose.models)

    const results = await Promise.all(
      models.map(async name => {
        const count = await mongoose.models[name].countDocuments()
        if (count > 0) {
          await mongoose.models[name].deleteMany()
          logger.verbose('Dropped collection', llo({ model: name, documents: count }))
        }
        return { model: name, dropped: count }
      }),
    )

    logger.info(
      'MongoDB collections dropped',
      llo({
        models: models.length,
        totalDropped: results.reduce((sum, r) => sum + r.dropped, 0),
      }),
    )

    return true
  },

  isConnected(): boolean {
    return mongoose.connection.readyState === 1
  },

  getConnectionState(): string {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
    return states[mongoose.connection.readyState] || 'unknown'
  },

  getConnectionStats() {
    return {
      state: Mongo.getConnectionState(),
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name,
      models: Object.keys(mongoose.models).length,
    }
  },

  /**
   * Wait for connection to be ready
   * @param timeout Maximum time to wait in milliseconds
   * @returns Promise that resolves when connected or rejects on timeout
   */
  async waitForConnection(timeout = 30000): Promise<void> {
    if (Mongo.isConnected()) {
      return
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`MongoDB connection timeout after ${timeout}ms`))
      }, timeout)

      const checkConnection = () => {
        if (Mongo.isConnected()) {
          clearTimeout(timeoutId)
          clearInterval(intervalId)
          resolve()
        }
      }

      const intervalId = setInterval(checkConnection, 100)
    })
  },
}

export default Mongo
