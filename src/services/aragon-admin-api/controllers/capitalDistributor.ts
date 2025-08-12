import { Models } from '@dbModels'
import { ErrorKeyEnum, type IAAddMembersListParams } from '@types'
import { assertExposable } from '@errors'
import logger from '@logger'
import MerkleTreeHelper from '@helpers/merkleTree'

const llo = logger.logMeta.bind(null, { service: 'controllers:CapitalDistributorAdmin' })

const CapitalDistributorAdminController = {
  uploadMembersList: async (params: IAAddMembersListParams): Promise<any> => {
    const { campaignId, pluginAddress, network, rewards } = params

    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    assertExposable(campaign, ErrorKeyEnum.notFound)

    const membersWithHistory = await Models.Reward.countDocuments({
      pluginAddress,
      network,
      campaignId,
      'claims.0': { $exists: true },
    })

    assertExposable(membersWithHistory === 0, ErrorKeyEnum.badParams)

    logger.info(
      'Uploading members list for campaign',
      llo({ campaignId, pluginAddress, network, memberCount: rewards.length }),
    )

    await Models.Reward.deleteMany({
      pluginAddress,
      network,
      campaignId,
    })

    const newMembers = rewards.map(({ address, amount }) => ({
      id: Models.Reward.getEntityId({
        pluginAddress,
        network,
        campaignId,
        address,
      }),
      pluginAddress,
      network,
      campaignId,
      userAddress: address,
      amount,
      claims: [],
    }))

    const result = await Models.Reward.insertMany(newMembers)

    logger.info(
      'Members list uploaded successfully',
      llo({
        campaignId,
        pluginAddress,
        network,
        totalMembers: result.length,
      }),
    )

    return {
      success: true,
      message: 'Members list uploaded successfully',
      totalMembers: result.length,
      campaignId,
    }
  },

  syncMerkleTree: async (params: { campaignId: string; pluginAddress: string; network: string }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params

    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    assertExposable(campaign, ErrorKeyEnum.notFound)

    const membersWithHistory = await Models.Reward.countDocuments({
      pluginAddress,
      network,
      campaignId,
      'claims.0': { $exists: true },
    })

    if (membersWithHistory > 0) {
      throw new Error(
        `Cannot sync merkle tree: ${membersWithHistory} members have claiming history. Operation not allowed.`,
      )
    }

    logger.info('Starting merkle tree sync for campaign', llo({ campaignId, pluginAddress, network }))

    const members = await Models.Reward.find({
      pluginAddress,
      network,
      campaignId,
    }).lean()

    if (!members || members.length === 0) {
      throw new Error('No members found to sync merkle tree. Upload members list first.')
    }

    // Prepare reward entries for a merkle tree
    const rewardEntries = members.map(member => ({
      address: member.userAddress,
      amount: member.amount,
    }))

    // Generate merkle tree
    const MerkleTreeHelper = (await import('@helpers/merkleTree')).default
    const treeResult = MerkleTreeHelper.generateMerkleTree(rewardEntries)
    const allProofs = MerkleTreeHelper.generateAllProofs(treeResult.tree)

    logger.info(
      'Merkle tree generated, updating member records',
      llo({
        campaignId,
        pluginAddress,
        network,
        merkleRoot: treeResult.merkleRoot,
        totalMembers: members.length,
      }),
    )

    // Update each member with their proof and leaf
    const bulkOps: any = []
    for (const member of members) {
      const memberProof = allProofs.get(member.userAddress.toLowerCase())

      if (memberProof) {
        bulkOps.push({
          updateOne: {
            filter: {
              pluginAddress,
              network,
              campaignId,
              userAddress: member.userAddress,
            },
            update: {
              $set: {
                proof: memberProof.proof,
                leaf: memberProof.leaf,
              },
            },
          },
        })
      }
    }

    if (bulkOps.length > 0) {
      await Models.Reward.bulkWrite(bulkOps)
    }

    // Update campaign with merkle root
    await campaign.updateMerkleRoot(treeResult.merkleRoot)

    logger.info(
      'Merkle tree sync completed successfully',
      llo({
        campaignId,
        pluginAddress,
        network,
        merkleRoot: treeResult.merkleRoot,
        updatedMembers: bulkOps.length,
      }),
    )

    return {
      success: true,
      message: 'Merkle tree synced successfully',
      merkleRoot: treeResult.merkleRoot,
      totalMembers: members.length,
      updatedMembers: bulkOps.length,
      campaignId,
    }
  },

  getMembersList: async (params: { campaignId: string; pluginAddress: string; network: string }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params

    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    assertExposable(campaign, ErrorKeyEnum.notFound)

    const members = await Models.Reward.find({
      pluginAddress,
      network,
      campaignId,
    })
      .select('userAddress amount claims proof leaf')
      .lean()

    const membersList = members.map(member => {
      const totalClaimed =
        member.claims?.reduce((total, claim) => (BigInt(total) + BigInt(claim.claimedAmount)).toString(), '0') || '0'

      return {
        address: member.userAddress,
        amount: member.amount,
        claimedAmount: totalClaimed,
        remainingAmount: (BigInt(member.amount) - BigInt(totalClaimed)).toString(),
        hasProof: !!(member.proof && member.proof.length > 0),
        hasLeaf: !!member.leaf,
        proofLength: member.proof?.length || 0,
      }
    })

    logger.info(
      'Retrieved members list',
      llo({
        campaignId,
        pluginAddress,
        network,
        memberCount: membersList.length,
      }),
    )

    return {
      members: membersList,
      total: membersList.length,
      campaignId,
    }
  },
}

export default CapitalDistributorAdminController
