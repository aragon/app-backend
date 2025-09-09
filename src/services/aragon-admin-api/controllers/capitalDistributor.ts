import { ErrorKeyEnum, type IAAddMembersListParams, IPluginInterfaceType, type NetworksEnum } from '@types'
import { MemberGovernanceFactory, type CapitalDistributorGovernance } from '@src/governance'
import { Models } from '@dbModels'
import { assertExposable } from '@errors'

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

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    return await governance.generateMerkleData({ campaignId })
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
