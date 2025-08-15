import { Models } from '@dbModels'
import { ErrorKeyEnum, type IAAddMembersListParams } from '@types'
import { assertExposable } from '@errors'
import logger from '@logger'
import MerkleTreeHelper from '@helpers/merkleTree'
import Utils from '@helpers/utils'
import DbTx from '@modules/dbTx'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'controllers:CapitalDistributorAdmin' })
const BATCH_SIZE = 10000
const CONCURRENCY_LIMIT = 10

const CapitalDistributorAdminController = {
  uploadMembersList: async (params: IAAddMembersListParams): Promise<any> => {
    const { campaignId, pluginAddress, network, rewards } = params

    const existingCampaign = await Models.Campaign.findExisting({
      pluginAddress,
      network,
      campaignId,
    })

    if (existingCampaign) {
      logger.warn(
        'Campaign already exists and is immutable',
        llo({
          campaignId,
          pluginAddress,
          network,
          campaignActive: existingCampaign.active,
        }),
      )
      assertExposable(false, ErrorKeyEnum.campaignAlreadyExists)
    }

    const existingRewards = await Models.CampaignReward.countDocuments({
      pluginAddress,
      network,
      campaignId,
    })

    if (existingRewards > 0) {
      logger.info(
        'Campaign rewards already exist - will clear and re-upload',
        llo({
          campaignId,
          pluginAddress,
          network,
          existingRewardCount: existingRewards,
        }),
      )
    }

    const result = await DbTx.executeTxFn(async ({ session }) => {
      await Models.CampaignReward.deleteMany(
        {
          pluginAddress,
          network,
          campaignId,
        },
        { session },
      )

      const newMembers = rewards.map(({ address, amount }) => ({
        id: Models.CampaignReward.getEntityId({
          pluginAddress,
          network,
          campaignId,
          userAddress: ethers.getAddress(address),
        }),
        pluginAddress,
        network,
        campaignId,
        userAddress: ethers.getAddress(address),
        amount,
        claims: [],
      }))

      const memberChunks = Utils.chunkArray(newMembers, BATCH_SIZE)

      const insertProcessor = async (chunk: any[]) => {
        const insertResult = await Models.CampaignReward.insertMany(chunk, { session })
        return insertResult.length
      }

      const insertResults = await Utils.processParallel(memberChunks, insertProcessor, {
        concurrency: CONCURRENCY_LIMIT,
        batchSize: BATCH_SIZE,
        onError: (error: any, chunk: any, index: any) => {
          logger.error(
            'Error processing member upload chunk',
            llo({
              error,
              chunkIndex: index,
              chunkSize: chunk?.length,
              campaignId,
            }),
          )
        },
      })

      const totalInserted = insertResults.reduce((sum: any, count: any) => sum + count, 0)

      await session.commitTransaction()
      await session.endSession()

      logger.info(
        'Members list uploaded successfully with batching',
        llo({
          campaignId,
          pluginAddress,
          network,
          totalMembers: totalInserted,
        }),
      )

      return {
        success: true,
        message: 'Members list uploaded successfully',
        totalMembers: totalInserted,
        campaignId,
      }
    })

    return result
  },

  generateMerkleData: async (params: { campaignId: string; pluginAddress: string; network: string }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params

    const existingCampaign = await Models.Campaign.findExisting({
      pluginAddress,
      network,
      campaignId,
    })

    if (existingCampaign) {
      logger.warn(
        'Campaign already exists and is immutable',
        llo({
          campaignId,
          pluginAddress,
          network,
          campaignActive: existingCampaign.active,
        }),
      )

      assertExposable(false, ErrorKeyEnum.campaignAlreadyExists)
    }

    const members = await Models.CampaignReward.find({
      pluginAddress,
      network,
      campaignId,
    }).lean()

    assertExposable(members && members.length > 0, ErrorKeyEnum.badParams)

    const rewardEntries = members.map((member: any) => ({
      address: member.userAddress,
      amount: member.amount,
    }))

    try {
      const merkleResult = MerkleTreeHelper.generateTreeWithProofs(rewardEntries)

      const result = await DbTx.executeTxFn(async ({ session }) => {
        const memberChunks = Utils.chunkArray(merkleResult.members, BATCH_SIZE)

        const updateProcessor = async (chunk: any[]) => {
          const bulkOps = chunk.map(member => ({
            updateOne: {
              filter: {
                pluginAddress,
                network,
                campaignId,
                userAddress: member.address,
              },
              update: {
                $set: {
                  proof: member.proof,
                  leaf: member.leaf,
                },
              },
            },
          }))

          const writeResult = await Models.CampaignReward.bulkWrite(bulkOps, { session })
          return writeResult.modifiedCount || 0
        }

        const updateResults = await Utils.processParallel(memberChunks, updateProcessor, {
          concurrency: CONCURRENCY_LIMIT,
          batchSize: BATCH_SIZE,
          onError: (error: any, chunk: any, index: any) => {
            logger.error(
              'Error processing merkle proof update chunk',
              llo({
                error,
                chunkIndex: index,
                chunkSize: chunk?.length,
                campaignId,
              }),
            )
          },
        })

        const totalUpdated = updateResults.reduce((sum: any, count: any) => sum + count, 0)

        await session.commitTransaction()
        await session.endSession()

        logger.info(
          'Merkle data generated and saved to database with batching',
          llo({
            campaignId,
            pluginAddress,
            network,
            merkleRoot: merkleResult.merkleRoot,
            totalMembers: merkleResult.members.length,
            totalUpdated,
          }),
        )

        return {
          success: true,
          merkleRoot: merkleResult.merkleRoot,
          totalMembers: merkleResult.members.length,
          updatedMembers: totalUpdated,
          campaignId,
        }
      })

      return result
    } catch (e) {
      logger.warn('Error generating merkle data', llo({ error: e, campaignId, pluginAddress, network }))
    }
    return {
      success: false,
    }
  },

  getMembersList: async (params: { campaignId: string; pluginAddress: string; network: string }): Promise<any> => {
    const { campaignId, pluginAddress, network } = params

    const campaign = await Models.Campaign.findCampaignById(pluginAddress, network, campaignId)
    assertExposable(campaign, ErrorKeyEnum.notFound)

    const members = await Models.CampaignReward.find({
      pluginAddress,
      network,
      campaignId,
    })
      .select('userAddress amount claims proof leaf')
      .lean()

    const membersList = members.map((member: any) => {
      const totalClaimed =
        member.claims?.reduce(
          (total: any, claim: any) => (BigInt(total) + BigInt(claim.claimedAmount)).toString(),
          '0',
        ) || '0'

      return {
        address: member.userAddress,
        amount: member.amount,
        claimedAmount: totalClaimed,
        remainingAmount: (BigInt(member.amount) - BigInt(totalClaimed)).toString(),
        hasProof: member.proof && member.proof.length > 0,
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

export { CapitalDistributorAdminController }
