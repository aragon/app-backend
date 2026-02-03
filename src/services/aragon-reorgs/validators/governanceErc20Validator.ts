import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { logCumulative } from './baseValidator'

export const GovernanceErc20Validator = {
  delegateVotesChanged: async (_parsedEvent: LogDescription, info: ILogInfo) => {
    logCumulative('DelegateVotesChanged', info)
  },
}
