import {
  EnumQueueName,
  ErrorKeyEnum,
  type IAAddMembersListParams,
  type IMerkleProofSync,
  IPluginInterfaceType,
  type NetworksEnum,
} from '@types'
import { type CapitalDistributorGovernance, MemberGovernanceFactory } from '@src/governance'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import RabbitMQHelper from '@helpers/rabbitMQ'

const CapitalDistributorAdminController = {
  uploadMembersList: async (params: IAAddMembersListParams): Promise<any> => {
    const { pluginAddress, network } = params

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    assertExposable(plugin && plugin.interfaceType === IPluginInterfaceType.capitalDistributor, ErrorKeyEnum.notFound)

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    return await governance.uploadMembersList(params)
  },

  generateMerkleData: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params
    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    assertExposable(plugin && plugin.interfaceType === IPluginInterfaceType.capitalDistributor, ErrorKeyEnum.notFound)

    await RabbitMQHelper.sendMessage(EnumQueueName.syncMerkleProofs, {
      id: `${pluginAddress}-${network}-${campaignId}`,
      params: {
        campaignId,
        pluginAddress,
        network,
      },
    })
  },

  getMerkleGenerationStatus: async (params: IMerkleProofSync) => {
    const { pluginAddress, network } = params
    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    assertExposable(plugin && plugin.interfaceType === IPluginInterfaceType.capitalDistributor, ErrorKeyEnum.notFound)
    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    return await governance.getMerkleGenerationStatus(params)
  },

  getCampaignDetails: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    assertExposable(plugin && plugin.interfaceType === IPluginInterfaceType.capitalDistributor, ErrorKeyEnum.notFound)

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    return await governance.getCampaignDetails({ campaignId })
  },
}

export { CapitalDistributorAdminController }
