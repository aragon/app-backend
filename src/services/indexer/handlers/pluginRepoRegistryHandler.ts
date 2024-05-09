import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:PluginRepoRegistryHandler' })

export const PluginRepoRegistryHandler = {
  pluginRepoRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('pluginRepoRegistered', llo({ parsedEvent }))
  },
}
