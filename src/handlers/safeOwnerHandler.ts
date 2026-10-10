import logger from '@logger'
import { SafeGovernance } from '@src/governance'
import { type HexAddress, type ILogInfo } from '@types'
import { getAddress, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:SafeOwnerHandler' })

/**
 * Owner changes of any Safe on the network reach here - the crawler matches on topic, not on
 * address. SafeGovernance stores one global SafeMember tuple and refreshes every DAO whose active
 * installed SPP settings currently refer to that Safe.
 */
export const SafeOwnerHandler = {
  addedOwner: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const owner = getAddress(String(parsedEvent.args.owner)) as HexAddress
    try {
      const member = await new SafeGovernance(info.address, info.network).getOrCreate(owner)
      if (member) logger.verbose('Safe owner added', llo({ ...info, owner }))
    } catch (error) {
      logger.warn('Unable to process Safe owner addition', llo({ ...info, owner, error }))
    }
  },

  removedOwner: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const owner = getAddress(String(parsedEvent.args.owner)) as HexAddress
    try {
      const removed = await new SafeGovernance(info.address, info.network).delete(owner)
      if (removed) logger.verbose('Safe owner removed', llo({ ...info, owner }))
    } catch (error) {
      logger.warn('Unable to process Safe owner removal', llo({ ...info, owner, error }))
    }
  },
}
