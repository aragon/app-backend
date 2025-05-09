import { EnumConnection, type IService, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'

export const RevertDbAtBlock: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const config = {
      [NetworksEnum.ethereumSepolia]: 6876125,
      // add additional network block number configs as needed
    }

    const networks = NetworkHelper.supportedNetworks()

    await Promise.all(
      networks.map(async ({ networkName }) => {
        const atBlockNumber = config[networkName]
        if (!atBlockNumber) {
          console.log(`No blockNumber configured for ${networkName}. Skipping.`) // eslint-disable-line no-console
          return
        }

        await Promise.all(
          Object.keys(Models).map(async modelName => {
            const model = Models[modelName]
            if (model.deleteMany) {
              const hasBlockNumberField = await model.exists({ blockNumber: { $exists: true } })
              if (!hasBlockNumberField) {
                console.log(`Model ${modelName} does not have a blockNumber field. Skipping.`) // eslint-disable-line no-console
                return
              }

              try {
                const result = await model.deleteMany({
                  network: networkName,
                  blockNumber: { $gt: atBlockNumber },
                })
                const msg = `Deleted ${result.deletedCount} documents in model ${modelName} for ${networkName} with blockNumber > ${atBlockNumber}`
                console.log(msg) // eslint-disable-line no-console
              } catch (err) {
                console.error(`Error deleting documents in model ${modelName} for ${networkName}:`, err) // eslint-disable-line no-console
              }
            }
          }),
        )

        // Update Models.ConfigIndexer with lastSync
        try {
          const updateResult = await Models.ConfigIndexer.updateMany(
            { network: networkName },
            { $set: { lastSync: atBlockNumber } },
          )
          const msg = `Updated lastSync to ${atBlockNumber} in ConfigIndexer for ${networkName}, matched ${updateResult.matchedCount}, modified ${updateResult.modifiedCount}`
          console.log(msg) // eslint-disable-line no-console
        } catch (err) {
          console.error(`Error updating lastSync in ConfigIndexer for ${networkName}:`, err) // eslint-disable-line no-console
        }
      }),
    )
  },

  stop: async () => {},
}

export default RevertDbAtBlock
