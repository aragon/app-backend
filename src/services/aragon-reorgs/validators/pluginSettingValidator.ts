import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

async function validateSetting(eventName: string, info: ILogInfo): Promise<void> {
  const entityId = Models.Setting.getEntityId({
    transactionHash: info.transactionHash,
    pluginAddress: info.address,
  })
  const record = await Models.Setting.findByEntityId(entityId)
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

export const PluginSettingValidator = {
  multisigSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSetting('MultisigSettingsUpdated', info)
  },

  votingSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSetting('VotingSettingsUpdated', info)
  },

  sppSettingsUpdated: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSetting('StagesUpdated', info)
  },

  exitFeePercentAdjusted: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    // exitFeePercentAdjusted updates an existing setting rather than creating one
    const plugin = await Models.Plugin.findByAddress(info.address, info.network)
    if (!plugin) {
      logNotFound('ExitFeePercentAdjusted', info, { pluginAddress: info.address })
      return
    }
    const setting = await Models.Setting.findActive({ pluginAddress: info.address, network: info.network })
    if (!setting) {
      logNotFound('ExitFeePercentAdjusted', info, { pluginAddress: info.address, note: 'no active setting' })
      return
    }
    logValid('ExitFeePercentAdjusted', info)
  },
}
