// @ts-nocheck
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import './sinon-mongoose'
import { ModelProxy } from '@src/models'
import config from '@config'

const MockDB = {
  replSet: null as typeof MongoMemoryReplSet | null,
  mongoUri: null as string | null,

  mongoOptions: {
    dbName: `${config.MONGO_DB.NAME}`,
    retryWrites: false,
    autoIndex: true,
  },

  connect: async () => {
    await MockDB._connectMongoDB()
    // await MockDB.syncIndexesForAllModels()
  },

  drop: async () => {
    /*eslint-disable no-async-promise-executor*/
    return new Promise(async resolve => {
      await Promise.all(
        Object.keys(mongoose.models).map(async name => {
          await mongoose.models[name].deleteMany()
        }),
      )
      resolve(true)
    })
  },

  async disconnect() {
    await mongoose.disconnect()
    await MockDB.replSet.stop()

    console.log('Mongoose successfully disconnected') // eslint-disable-line no-console
  },

  _connectMongoDB: async () => {
    MockDB.replSet = new MongoMemoryReplSet({
      binary: {
        version: '5.0.8',
      },
      instanceOpts: [
        {
          storageEngine: 'wiredTiger',
        },
      ],
      replSet: {
        name: `${config.MONGO_DB.NAME}`,
        dbName: `${config.MONGO_DB.NAME}`,
        count: 1,
      },
    })

    await MockDB.replSet.start()
    const uri = MockDB.replSet.getUri()
    await ModelProxy.setMongoModels()

    await mongoose.connect(uri, MockDB.mongoOptions)
    mongoose.connection.on('connected', () => {
      console.log(`Mongoose connected to ${uri}`)
    })
    mongoose.set('debug', config.MONGO_DB.DEBUGGER)
    MockDB.mongoUri = uri
    return uri
  },

  _dropMongoDB: async () => {
    /*eslint-disable no-async-promise-executor*/
    return new Promise(async resolve => {
      await Promise.all(
        Object.keys(mongoose.models).map(async name => {
          await mongoose.models[name].deleteMany()
        }),
      )
      resolve(true)
    })
  },

  _disconnectMongoDB: async () => {
    await mongoose.disconnect()
    await MockDB.replSet.stop()
    console.log('Mongoose successfully disconnected') // eslint-disable-line no-console
  },

  syncIndexesForAllModels: async () => {
    const modelNames = Object.keys(mongoose.models)
    await Promise.all(
      modelNames.map(async name => {
        try {
          await mongoose.models[name].syncIndexes()
          console.log(`Indexes synchronized for model: ${name}`)
        } catch (error) {
          console.error(`Failed to synchronize indexes for model: ${name}`, error)
        }
      }),
    )
  },
}

export { MockDB }
