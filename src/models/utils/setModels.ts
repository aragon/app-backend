import logger from '@logger'
import { clientRegistry } from '@src/clients'
import { getModelForClass } from '@typegoose/typegoose'
import { type IMongoModel } from '@types'
import * as fs from 'fs'
import * as path from 'path'

const llo = logger.logMeta.bind(null, { service: 'db:setMongoModels' })

export const setMongoModels = async (): Promise<any> => {
  const schemas: IMongoModel | any = {}

  const filePath = path.join(__dirname, '..', 'schema/')
  const files = await fs.promises.readdir(filePath)

  for (const filename of files) {
    if (/\.js|\.ts$/.test(filename)) {
      try {
        const modulePath = path.join(filePath, filename)
        const importedModule = require(modulePath) // eslint-disable-line @typescript-eslint/no-var-requires
        schemas[importedModule.default.name] = getModelForClass(importedModule.default)
      } catch (error) {
        logger.error(`Error loading Mongo model from file ${filename}:`, llo({ error }))
      }
    }
  }

  // Load client extension models
  for (const client of clientRegistry.getAll()) {
    try {
      const clientModels = client.getModels()
      for (const modelDef of clientModels) {
        schemas[modelDef.name] = getModelForClass(modelDef.schemaClass)
      }
    } catch (error) {
      logger.error('Failed to load client models', llo({ client: client.name, error }))
    }
  }

  Object.keys(schemas).forEach(modelName => {
    // biome-ignore lint/suspicious/noConsole: CLI output for debugging model loading
    console.log('MongoModel', modelName)
  })

  return schemas
}
