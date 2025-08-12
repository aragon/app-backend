import logger from '@logger'
import { EnumQueueName, type ILogInfo, IPluginInterfaceType } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'handlers:MultisigHandler' })

export const MultisigHandler = {
  membersAdded: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const exitingPlugin = await Models.Plugin.findByAddress(address, network)

    if (!exitingPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    // Create multisig governance instance
    const governance = MemberGovernanceFactory.create({
      address,
      network,
      interfaceType: IPluginInterfaceType.multisig,
    })

    const { members } = parsedEvent.args
    for (const memberAddress of members) {
      // Use the governance instance to handle member creation
      // This will handle both Member and PluginMember creation
      await governance.getOrCreate(memberAddress)

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: exitingPlugin.daoAddress,
        params: { address: exitingPlugin.daoAddress, network: exitingPlugin.network },
      })
    }
  },

  membersRemoved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const { address, network } = info

    const exitingPlugin = await Models.Plugin.findByAddress(address, network)

    if (!exitingPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    // Create multisig governance instance
    const governance = MemberGovernanceFactory.create({
      address,
      network,
      interfaceType: IPluginInterfaceType.multisig,
    })

    const { members } = parsedEvent.args
    for (const memberAddress of members) {
      // Use the governance instance to handle member removal
      await governance.delete(memberAddress)

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: exitingPlugin.daoAddress,
        params: { address: exitingPlugin.daoAddress, network: exitingPlugin.network },
      })
    }
  },
}
