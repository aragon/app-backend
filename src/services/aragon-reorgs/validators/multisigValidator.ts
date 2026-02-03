import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logCumulative } from './baseValidator'

export const MultisigValidator = {
  membersAdded: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('MembersAdded', info)
  },

  membersRemoved: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('MembersRemoved', info)
  },
}
