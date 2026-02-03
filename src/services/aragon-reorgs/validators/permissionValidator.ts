import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

async function validateDaoPermission(eventName: string, info: ILogInfo): Promise<void> {
  const entityId = Models.DaoPermission.getEntityId({
    network: info.network,
    daoAddress: info.address,
    transactionHash: info.transactionHash,
    transactionIndex: info.transactionIndex,
    logIndex: info.logIndex,
  })
  const record = await Models.DaoPermission.findByEntityId(entityId)
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

export const PermissionValidator = {
  handleGrantOnDao: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateDaoPermission('Granted', info)
  },

  handleRevokeOnDao: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    await validateDaoPermission('Revoked', info)
  },
}
