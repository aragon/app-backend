import logger from '@logger'
import type { LogDescription } from 'ethers'
import type { ILogInfo } from '@types'
const llo = logger.logMeta.bind(null, { service: 'service:handler:LockManagerHandler' })

const LockManagerHandler = {
  balanceLocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    logger.verbose('Balance Locked Event', llo({ parsedEvent, info }))
    // Handle the BalanceLocked event logic here
  },
  balanceUnlocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    logger.verbose('Balance Unlocked Event', llo({ parsedEvent, info }))
    // Handle the BalanceUnlocked event logic here
  },
}

export default LockManagerHandler
