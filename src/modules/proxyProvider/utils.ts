import type { LogServicePattern, NetworksEnum } from '@types'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'

const ProxyUtils = {
  updateProgressInConfigIndexer: async (
    network: NetworksEnum,
    service: LogServicePattern,
    lastSync: number,
    finished?: boolean,
  ) => {
    await DbTx.executeTxFn(async ({ session }) => {
      const existingConfig = await Models.ConfigIndexer.findExistingLog(
        {
          network,
          service,
        },
        { session },
      )

      if (existingConfig) {
        await existingConfig.update(
          {
            lastSync,
            end: finished,
          },
          { session },
        )
      } else {
        await Models.ConfigIndexer.create(
          {
            network,
            service,
            lastSync,
            end: finished,
          },
          { session },
        )
      }

      await session.commitTransaction()
      await session.endSession()
    })
  },

  getProgressFromConfigIndexer: async (network: NetworksEnum, service: LogServicePattern) => {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network,
      service,
    })
    if (existingConfig) {
      return existingConfig
    }
    return null
  },
}

export default ProxyUtils
