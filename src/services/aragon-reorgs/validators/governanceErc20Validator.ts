import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'

export const GovernanceErc20Validator = {
  // TODO: Implement proper validation for DelegateVotesChanged cumulative events.
  // DelegateVotesChanged emits total voting power (newBalance), not a delta.
  // We can validate by checking TokenMember.votingPower and lastVPBlockNumber
  // against the finalized event's newBalance and blockNumber.
  delegateVotesChanged: async (_parsedEvent: LogDescription, _info: ILogInfo) => {},
}
