import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginRepoRegistryHandler' })

export const PluginRepoRegistryHandler = {
  pluginRepoRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('pluginRepoRegistered', llo({ parsedEvent }))

    const pluginRepo = parsedEvent.args.pluginRepo
    const existingLog = await Models.LogPluginRepo.findExistingLog(txLog.transactionHash, pluginRepo)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginRepoLog = {
          network,
          subdomain: parsedEvent.args.subdomain,
          pluginRepo,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }
        await Models.LogPluginRepo.create(pluginRepoLog, { session })

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New PluginRepoLog', llo({ pluginRepoLog }))
      })
    }
  },
}
