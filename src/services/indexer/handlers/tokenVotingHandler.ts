import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:TokenVotingHandler' })

export const TokenVotingHandler = {
  membersAdded: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },

  membersRemoved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersRemoved', llo({ parsedEvent }))
  },

  membershipContractAnnounced: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membershipContractAnnounced', llo({ parsedEvent }))
  },

  proposalCreated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('proposalCreated', llo({ parsedEvent }))
  },

  proposalExecuted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('proposalExecuted', llo({ parsedEvent }))
  },

  voteCast: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('voteCast', llo({ parsedEvent }))
  },

  voteCastForbidden: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('voteCastForbidden', llo({ parsedEvent }))
  },
}
