import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import { EnumConnection, type IService, NetworksEnum } from '@types'

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
          return
        }

        await Promise.all(
          Object.keys(Models).map(async modelName => {
            const model = Models[modelName]
            if (model.deleteMany) {
              const hasBlockNumberField = await model.exists({ blockNumber: { $exists: true } })
              if (!hasBlockNumberField) {
                return
              }

              try {
                const result = await model.deleteMany({
                  network: networkName,
                  blockNumber: { $gt: atBlockNumber },
                })
                const _msg = `Deleted ${result.deletedCount} documents in model ${modelName} for ${networkName} with blockNumber > ${atBlockNumber}`
              } catch (_err) {}
            }
          }),
        )

        // Update Models.ConfigIndexer with lastSync
        try {
          const updateResult = await Models.ConfigIndexer.updateMany(
            { network: networkName },
            { $set: { lastSync: atBlockNumber } },
          )
          const _msg = `Updated lastSync to ${atBlockNumber} in ConfigIndexer for ${networkName}, matched ${updateResult.matchedCount}, modified ${updateResult.modifiedCount}`
        } catch (_err) {}
      }),
    )
  },

  stop: async () => {},
}

export default RevertDbAtBlock
