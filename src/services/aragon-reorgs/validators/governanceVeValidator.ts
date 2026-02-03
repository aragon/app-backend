import { Models } from '@dbModels'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logCumulative, logNotFound, logValid } from './baseValidator'

export const GovernanceVeValidator = {
  deposit: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('Deposit', info)
  },

  withdraw: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('Withdraw', info)
  },

  split: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('Split', info)
  },

  merge: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('Merged', info)
  },

  exitQueued: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('ExitQueued', info)
  },

  exitCancelled: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('ExitCancelled', info)
  },

  minDepositSet: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    const setting = await Models.Setting.findActive({ pluginAddress: info.address, network: info.network })
    if (!setting) {
      logNotFound('MinDepositSet', info, { pluginAddress: info.address })
      return
    }
    logValid('MinDepositSet', info)
  },

  minLockSet: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    const setting = await Models.Setting.findActive({ pluginAddress: info.address, network: info.network })
    if (!setting) {
      logNotFound('MinLockSet', info, { pluginAddress: info.address })
      return
    }
    logValid('MinLockSet', info)
  },

  delegateTokens: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('TokensDelegated', info)
  },

  unDelegateTokens: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('TokensUndelegated', info)
  },
}
