import { type IAAddMembersListParams, IPluginInterfaceType, type NetworksEnum } from '@types'
import { MemberGovernanceFactory, type CapitalDistributorGovernance } from '@src/governance'

const CapitalDistributorAdminController = {
  uploadMembersList: async (params: IAAddMembersListParams): Promise<any> => {
    const { pluginAddress, network } = params
    const governance = MemberGovernanceFactory.create({
      address: pluginAddress,
      network,
      interfaceType: IPluginInterfaceType.capitalDistributor,
    }) as CapitalDistributorGovernance
    return await governance.uploadMembersList(params)
  },

  generateMerkleData: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params
    const governance = MemberGovernanceFactory.create({
      address: pluginAddress,
      network,
      interfaceType: IPluginInterfaceType.capitalDistributor,
    }) as CapitalDistributorGovernance
    return await governance.generateMerkleData({ campaignId })
  },

  getCampaignDetails: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params
    const governance = MemberGovernanceFactory.create({
      address: pluginAddress,
      network,
      interfaceType: IPluginInterfaceType.capitalDistributor,
    }) as CapitalDistributorGovernance
    return await governance.getCampaignDetails({ campaignId })
  },
}

export { CapitalDistributorAdminController }
