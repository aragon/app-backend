import logger from '@logger'
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

  Object.keys(schemas).forEach(_modelName => {})

  return schemas
}
