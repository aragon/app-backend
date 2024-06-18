import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginRepoRegistryHandler' })

export const PluginRepoRegistryHandler = {
  pluginRepoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const pluginRepo = parsedEvent.args.pluginRepo
      const existingLog = await Models.LogPluginRepo.findExistingLog({
        transactionHash: info.transactionHash,
        pluginRepo,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const pluginRepoLog = {
            network: info.network,
            subdomain: parsedEvent.args.subdomain,
            pluginRepo,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
          }
          const logDb = await Models.LogPluginRepo.create(pluginRepoLog, { session } as any)

          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New PluginRepo', llo({ ...info, logId: logDb.id }))
        })
      }
    } catch (error) {
      logger.error('Error PluginRepoRegister', llo({ ...info, error }))
    }
  },
}
