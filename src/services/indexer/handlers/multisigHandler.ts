import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MultisigHandler' })

export const MultisigHandler = {
  multisigSettingsUpdated: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('multisigSettingsUpdated', llo({ parsedEvent }))
  },
}
