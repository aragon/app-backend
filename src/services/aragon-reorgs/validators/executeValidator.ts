import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

async function validateSelectorPermission(eventName: string, info: ILogInfo): Promise<void> {
  const entityId = Models.SelectorPermission.getEntityId({
    network: info.network,
    transactionHash: info.transactionHash,
    transactionIndex: info.transactionIndex,
    logIndex: info.logIndex,
    conditionAddress: info.address,
  })
  const record = await Models.SelectorPermission.findByEntityId(entityId)
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

export const ExecuteValidator = {
  selectorAllowed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSelectorPermission('SelectorAllowed', info)
  },

  selectorDisallowed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    // selectorDisallowed updates an existing record - find by selector + target
    const selector = _parsedEvent.args.selector
    const target = _parsedEvent.args.where
    const record = await Models.SelectorPermission.findOne({
      selector,
      target,
      conditionAddress: info.address,
      network: info.network,
    })
    if (!record) {
      logNotFound('SelectorDisallowed', info, { selector, target })
      return
    }
    if (record.disallowed?.blockNumber && record.disallowed.blockNumber !== info.blockNumber) {
      logMismatch('SelectorDisallowed', info, {
        dbBlock: record.disallowed.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('SelectorDisallowed', info, { selector, target })
  },

  nativeTransfersAllowed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateSelectorPermission('NativeTransfersAllowed', info)
  },

  nativeTransfersDisallowed: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    const target = _parsedEvent.args.where
    const record = await Models.SelectorPermission.findOne({
      selector: null,
      target,
      conditionAddress: info.address,
      network: info.network,
      isNativeTransfer: true,
    })
    if (!record) {
      logNotFound('NativeTransfersDisallowed', info, { target })
      return
    }
    if (record.disallowed?.blockNumber && record.disallowed.blockNumber !== info.blockNumber) {
      logMismatch('NativeTransfersDisallowed', info, {
        dbBlock: record.disallowed.blockNumber,
        finalizedBlock: info.blockNumber,
      })
      return
    }
    logValid('NativeTransfersDisallowed', info, { target })
  },
}
