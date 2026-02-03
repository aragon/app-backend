import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

export const MetadataValidator = {
  metadataSet: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    const entityId = Models.LogMetadata.getEntityId({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    const record = await Models.LogMetadata.findByEntityId(entityId)
    if (!record) {
      logNotFound('MetadataSet', info, { entityId })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('MetadataSet', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('MetadataSet', info, { entityId })
  },
}
