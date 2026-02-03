import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

export const PluginRepoRegistryValidator = {
  pluginRepoRegistered: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    const entityId = Models.PluginRepo.getEntityId({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    const record = await Models.PluginRepo.findByEntityId(entityId)
    if (!record) {
      logNotFound('PluginRepoRegistered', info, { entityId })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('PluginRepoRegistered', info, {
        entityId,
        dbBlock: record.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('PluginRepoRegistered', info, { entityId })
  },
}
