import { IPluginInterfaceType, type NetworksEnum } from '@types'
import { MemberGovernanceFactory, type CapitalDistributorGovernance } from '@src/governance'
import { Models } from '@dbModels'
import logger from '@logger'
const llo = logger.logMeta.bind(null, { service: 'CapitalDistributorGateway' })

const CapitalDistributorGateway = {
  generateMerkleData: async (params: {
    campaignId: string
    pluginAddress: string
    network: NetworksEnum
  }): Promise<any> => {
    const startTime = Date.now()
    logger.info('Generating merkle data', llo({ params }))
    const { campaignId, pluginAddress, network } = params
    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    if (!plugin || plugin.interfaceType !== IPluginInterfaceType.capitalDistributor) {
      logger.warn('Plugin not found or invalid interface type', llo({ params }))
      return
    }

    const governance = MemberGovernanceFactory.createFromPlugin(plugin) as CapitalDistributorGovernance
    const response = await governance.generateMerkleData({ campaignId })

    if (response?.success && response?.merkleRoot) {
      const id = Models.CampaignMerkleRoot.getEntityId({ pluginAddress, network, campaignId })

      await Models.CampaignMerkleRoot.findOneAndUpdate(
        { id },
        {
          $set: {
            id,
            pluginAddress,
            network,
            campaignId,
            merkleRoot: response.merkleRoot,
            totalMembers: response.totalMembers || 0,
          },
        },
        { upsert: true, new: true },
      )
    }

    logger.info('Merkle data Generation completed', llo({ params, timeTaken: `${Date.now() - startTime}ms` }))
  },
}

export { CapitalDistributorGateway }
