import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  callbackReceived: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('callbackReceived', llo({ parsedEvent }))
  },

  deposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('deposited', llo({ parsedEvent }))
  },

  executed: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('executed', llo({ parsedEvent }))
  },

  granted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('granted', llo({ parsedEvent }))
  },

  nativeTokenDeposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('nativeTokenDeposited', llo({ parsedEvent }))
  },

  newURI: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('newURI', llo({ parsedEvent }))
  },

  revoked: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('revoked', llo({ parsedEvent }))
  },

  standardCallbackRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('standardCallbackRegistered', llo({ parsedEvent }))
  },

  trustedForwarderSet: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('trustedForwarderSet', llo({ parsedEvent }))
  },
}
