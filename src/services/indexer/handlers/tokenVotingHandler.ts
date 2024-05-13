import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:TokenVotingHandler' })

export const TokenVotingHandler = {
  votingSettingsUpdated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('votingSettingsUpdated', llo({ parsedEvent }))
  },
}
