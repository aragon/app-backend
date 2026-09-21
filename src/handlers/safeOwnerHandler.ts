import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { type HexAddress, type ILogInfo } from '@types'
import { getAddress, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:SafeOwnerHandler' })

/**
 * Owner changes of any Safe on the network reach here - the crawler matches on topic, not on
 * address. SafeBodyMembersModule stores one global SafeMember tuple and refreshes every DAO whose
 * active installed SPP settings currently refer to that Safe.
 */
export const SafeOwnerHandler = {
  addedOwner: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const owner = getAddress(String(parsedEvent.args.owner)) as HexAddress
    try {
      const daoCount = await SafeBodyMembersModule.addOwner(info.network, info.address, owner)
      if (daoCount) logger.verbose('Safe owner added to DAOs', llo({ ...info, owner, daoCount }))
    } catch (error) {
      logger.warn('Unable to process Safe owner addition', llo({ ...info, owner, error }))
    }
  },

  removedOwner: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const owner = getAddress(String(parsedEvent.args.owner)) as HexAddress
    try {
      const deletedCount = await SafeBodyMembersModule.removeOwner(info.network, info.address, owner)
      if (deletedCount) logger.verbose('Safe owner removed from DAOs', llo({ ...info, owner, deletedCount }))
    } catch (error) {
      logger.warn('Unable to process Safe owner removal', llo({ ...info, owner, error }))
    }
  },
}
