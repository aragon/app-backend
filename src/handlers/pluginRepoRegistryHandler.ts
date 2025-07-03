import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import type PluginRepo from '@models/schema/pluginRepo'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'handlers:PluginRepoRegistryHandler' })

export const PluginRepoRegistryHandler = {
  pluginRepoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const timestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
      await DbTx.executeTxFn(async ({ session }) => {
        const pluginRepo = parsedEvent.args.pluginRepo
        const existingLog = await Models.PluginRepo.findExistingLog(
          {
            network: info.network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
          },
          { session },
        )
        if (existingLog) return

        const document: Partial<PluginRepo> = {
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp: timestamp,
          subdomain: parsedEvent.args.subdomain,
          pluginRepo,
        }

        const logDb = await Models.PluginRepo.create(document, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New PluginRepo', llo({ info, logId: logDb.id }))
      })
    } catch (error) {
      logger.error('Error pluginRepoRegistered', llo({ error, parsedEvent, info }))
    }
  },
}
