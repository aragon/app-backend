import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import type PluginRepo from '@models/schema/pluginRepo'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginRepoRegistryHandler' })

export const PluginRepoRegistryHandler = {
  pluginRepoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const pluginRepo = parsedEvent.args.pluginRepo
    const existingLog = await Models.PluginRepo.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    if (existingLog) return

    const document: Partial<PluginRepo> = {
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      subdomain: parsedEvent.args.subdomain,
      pluginRepo,
    }

    await DbOperations.createDocument(Models.PluginRepo, document, info, 'New PluginRepo', llo)
  },
}
