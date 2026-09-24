import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:SafeOwnerHandler' })

/** Owner changes of any Safe on the network reach here; the crawler matches on topic, not on address. */
const ownerChanged = async (info: ILogInfo) => {
  try {
    const daoCount = await SafeBodyMembersModule.ownerChanged(info.network, info.address)
    if (daoCount) logger.verbose('Safe owners synced', llo({ ...info, daoCount }))
  } catch (error) {
    logger.warn('Unable to sync Safe owners after an owner event', llo({ ...info, error }))
  }
}

export const SafeOwnerHandler = {
  addedOwner: async (_parsedEvent: LogDescription, info: ILogInfo) => ownerChanged(info),

  removedOwner: async (_parsedEvent: LogDescription, info: ILogInfo) => ownerChanged(info),
}
