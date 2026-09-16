import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { type HexAddress, type ILogInfo } from '@types'
import { getAddress, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:SafeOwnerHandler' })

/**
 * Owner changes of any Safe on the network reach here - the crawler matches on topic, not on
 * address. `SafeBodyMembersModule` answers "is this Safe a body anywhere" from one indexed query,
 * so a Safe that governs nothing costs a lookup and nothing else.
 */
export const SafeOwnerHandler = {
  addedOwner: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const owner = getAddress(String(parsedEvent.args.owner)) as HexAddress
    const daoCount = await SafeBodyMembersModule.addOwner(info.network, info.address, owner)

    if (daoCount) logger.verbose('Safe owner added to DAOs', llo({ ...info, owner, daoCount }))
  },

  removedOwner: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const owner = getAddress(String(parsedEvent.args.owner)) as HexAddress
    const deletedCount = await SafeBodyMembersModule.removeOwner(info.network, info.address, owner)

    if (deletedCount) logger.verbose('Safe owner removed from DAOs', llo({ ...info, owner, deletedCount }))
  },
}
