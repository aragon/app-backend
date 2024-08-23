import logger from '@logger'
import { type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MultisigHandler' })

export const MultisigHandler = {
  membersAdded: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const pluginExisted = await Models.Plugin.findByAddress(address, network)

    if (!pluginExisted) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const { members } = parsedEvent.args
    for (const memberAddress of members) {
      await ProxyMember.addToDao({
        memberAddress,
        daoAddress: pluginExisted.daoAddress,
        pluginAddress: address,
        network,
      })
    }
  },

  membersRemoved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const pluginExisted = await Models.Plugin.findByAddress(address, network)

    if (!pluginExisted) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const { members } = parsedEvent.args
    for (const memberAddress of members) {
      await ProxyMember.removeFromDao({
        memberAddress,
        daoAddress: pluginExisted.daoAddress,
        pluginAddress: address,
        network,
      })
    }
  },
}
