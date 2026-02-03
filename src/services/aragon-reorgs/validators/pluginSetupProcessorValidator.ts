import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

async function validateLogPluginSetupProcessor(eventName: string, event: string, info: ILogInfo): Promise<void> {
  const entityId = Models.LogPluginSetupProcessor.getEntityId({
    network: info.network,
    transactionHash: info.transactionHash,
    transactionIndex: info.transactionIndex,
    logIndex: info.logIndex,
    event,
  })
  const record = await Models.LogPluginSetupProcessor.findByEntityId(entityId)
  if (!record) {
    logNotFound(eventName, info, { entityId })
    return
  }
  if (record.blockNumber !== info.blockNumber) {
    logMismatch(eventName, info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
    return
  }
  logValid(eventName, info, { entityId })
}

export const PluginSetupProcessorValidator = {
  installationPrepared: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPluginSetupProcessor('InstallationPrepared', 'InstallationPrepared', info)
  },

  installationApplied: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPluginSetupProcessor('InstallationApplied', 'InstallationApplied', info)
  },

  updatePrepared: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPluginSetupProcessor('UpdatePrepared', 'UpdatePrepared', info)
  },

  updateApplied: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPluginSetupProcessor('UpdateApplied', 'UpdateApplied', info)
  },

  uninstallationPrepared: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPluginSetupProcessor('UninstallationPrepared', 'UninstallationPrepared', info)
  },

  uninstallationApplied: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateLogPluginSetupProcessor('UninstallationApplied', 'UninstallationApplied', info)
  },
}
