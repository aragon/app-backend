import { Models } from '@dbModels'
import logger from '@logger'
import { EnumConnection, EnumServiceName, type IService, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Tools: CleanDb' })

export const CleanDb: IService = {
  name: EnumServiceName.ARAGON_TOOLS,
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    const networkToDelete = NetworksEnum.katanaMainnet

    try {
      // Iterate over all models in Models
      for (const [modelName, model] of Object.entries(Models)) {
        // Ensure the model has a deleteMany method
        const dbModel = model as any
        if (typeof dbModel.deleteMany === 'function') {
          const result = await dbModel.deleteMany({ network: networkToDelete })
          logger.verbose(
            `Deleted ${result.deletedCount} documents from ${modelName} where network is ${networkToDelete}`,
            llo(),
          )
        } else {
          logger.verbose(`Model ${modelName} does not support deleteMany operation.`, llo())
        }
      }
    } catch (error: any) {
      logger.error(`Error during cleanup: ${error.message}`, llo({ error }))
      throw error // Re-throw the error if you want to handle it upstream
    }

    logger.info('END')
  },

  stop: async () => {},
}

export default CleanDb
