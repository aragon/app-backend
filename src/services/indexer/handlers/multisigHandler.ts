import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MultisigHandler' })

export const MultisigHandler = {
  approved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('approved', llo({ parsedEvent }))
  },

  membersAdded: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },

  membersRemoved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },

  membershipContractAnnounced: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },

  proposalCreated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },

  proposalExecuted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },

  multisigSettingsUpdated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))
  },
}
