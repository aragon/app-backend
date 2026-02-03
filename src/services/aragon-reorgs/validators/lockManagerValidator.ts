import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logCumulative } from './baseValidator'

export const LockManagerValidator = {
  balanceLocked: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('BalanceLocked', info)
  },

  balanceUnlocked: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('BalanceUnlocked', info)
  },
}
