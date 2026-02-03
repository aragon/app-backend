import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logMismatch, logNotFound, logValid } from './baseValidator'

export const DaoRegistryValidator = {
  daoRegistered: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = parsedEvent.args.dao
    const entityId = Models.Dao.getEntityId({
      network: info.network,
      address: daoAddress,
    })
    const record = await Models.Dao.findByEntityId(entityId)
    if (!record) {
      logNotFound('DAORegistered', info, { entityId, daoAddress })
      return
    }
    if (record.blockNumber !== info.blockNumber) {
      logMismatch('DAORegistered', info, { entityId, dbBlock: record.blockNumber, finalizedBlock: info.blockNumber })
      return
    }
    logValid('DAORegistered', info, { entityId })
  },

  nativeTransfer: async (_parsedEvent: LogDescription, _info: ILogInfo) => {
    // no DB record to validate - handler only sends RabbitMQ messages
  },
}
