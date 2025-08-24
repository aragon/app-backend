import { Models } from '@dbModels'
import {
  type HexAddress,
  type NetworksEnum,
  ErrorKeyEnum,
  type IAAddMembersListParams,
  type ICampaignResponse,
  type IPaginationParams,
  type IPaginatedResult,
  type ICampaignApiParams,
  type IUserCampaignStatus,
  type IMembersResponse,
} from '@types'
import { assertExposable } from '@errors'
import logger from '@logger'
import MerkleTreeHelper from '@helpers/merkleTree'
import Utils from '@helpers/utils'
import DbTx from '@modules/dbTx'
import { ethers } from 'ethers'
import { BaseGovernance } from './baseGovernance'

const BATCH_SIZE = 10000
const CONCURRENCY_LIMIT = 10

export class CapitalDistributorGovernance extends BaseGovernance {
  constructor(address: HexAddress, network: NetworksEnum) {
    super(address, network)
    this.llo = logger.logMeta.bind(null, {
      service: 'CapitalDistributorGovernance',
    })
  }

  async uploadMembersList(params: IAAddMembersListParams): Promise<any> {
    const { campaignId, pluginAddress, network, rewards } = params

    if (pluginAddress !== this.address || network !== this.network) {
      throw new Error('Plugin address or network mismatch')
    }

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    assertExposable(plugin, ErrorKeyEnum.notFound)

    const existingCampaign = await Models.Campaign.findExisting({
      pluginAddress,
      network,
      campaignId,
    })

    if (existingCampaign?.active) {
      logger.warn(
        'Campaign exists and is active - cannot update user list',
        this.llo({
          campaignId,
          campaignActive: existingCampaign.active,
        }),
      )
      assertExposable(false, ErrorKeyEnum.alreadyExists)
    }

    return await this.bulkUpsertRewards(campaignId, rewards)
  }

  private async bulkUpsertRewards(
    campaignId: string,
    rewards: Array<{ address: string; amount: string }>,
  ): Promise<any> {
    return await DbTx.executeTxFn(async ({ session }) => {
      const existingRewards = await Models.CampaignReward.find(
        {
          pluginAddress: this.address,
          network: this.network,
          campaignId,
        },
        null,
        { session },
      ).lean()

      const existingRewardsMap = new Map(
        existingRewards.map((reward: any) => [reward.userAddress.toLowerCase(), reward]),
      )
      const newRewardsMap = new Map(
        rewards.map(({ address, amount }) => [ethers.getAddress(address).toLowerCase(), { address, amount }]),
      )

      let totalInserted = 0
      let totalUpdated = 0
      let totalDeleted = 0

      const upsertOps = rewards.map(({ address, amount }) => {
        const normalizedAddress = ethers.getAddress(address)
        const existingReward = existingRewardsMap.get(normalizedAddress.toLowerCase())

        if (existingReward) {
          return {
            updateOne: {
              filter: {
                pluginAddress: this.address,
                network: this.network,
                campaignId,
                userAddress: normalizedAddress,
              },
              update: { $set: { amount } },
            },
          }
        } else {
          return {
            insertOne: {
              document: {
                id: Models.CampaignReward.getEntityId({
                  pluginAddress: this.address,
                  network: this.network,
                  campaignId,
                  userAddress: normalizedAddress,
                }),
                pluginAddress: this.address,
                network: this.network,
                campaignId,
                userAddress: normalizedAddress,
                amount,
                totalClaimed: '0',
                claims: [],
              },
            },
          }
        }
      })

      const usersToDelete = existingRewards
        .filter((existing: any) => !newRewardsMap.has(existing.userAddress.toLowerCase()))
        .map((reward: any) => reward.userAddress)

      if (upsertOps.length > 0) {
        const upsertChunks = Utils.chunkArray(upsertOps, BATCH_SIZE)

        const upsertProcessor = async (chunk: any[]) => {
          const writeResult = await Models.CampaignReward.bulkWrite(chunk, { session })
          return {
            inserted: writeResult.insertedCount || 0,
            updated: writeResult.modifiedCount || 0,
          }
        }

        const upsertResults = await Utils.processParallel(upsertChunks, upsertProcessor, {
          concurrency: CONCURRENCY_LIMIT,
          batchSize: BATCH_SIZE,
          onError: (error: any, chunk: any, index: any) => {
            logger.error(
              'Error processing upsert chunk',
              this.llo({
                error,
                chunkIndex: index,
                chunkSize: chunk?.length,
                campaignId,
              }),
            )
          },
        })

        totalInserted = upsertResults.reduce((sum: any, result: any) => sum + result.inserted, 0)
        totalUpdated = upsertResults.reduce((sum: any, result: any) => sum + result.updated, 0)
      }

      // 3. Delete users not in the new list
      if (usersToDelete.length > 0) {
        const deleteResult = await Models.CampaignReward.deleteMany(
          {
            pluginAddress: this.address,
            network: this.network,
            campaignId,
            userAddress: { $in: usersToDelete },
          },
          { session },
        )
        totalDeleted = deleteResult.deletedCount || 0
      }

      await session.commitTransaction()
      await session.endSession()

      logger.info(
        'Members list processed successfully with upserts',
        this.llo({
          campaignId,
          totalInserted,
          totalUpdated,
          totalDeleted,
          totalProcessed: rewards.length,
        }),
      )

      return {
        success: true,
        message: 'Members list processed successfully',
        totalInserted,
        totalUpdated,
        totalDeleted,
        totalProcessed: rewards.length,
        campaignId,
      }
    })
  }

  async generateMerkleData(params: { campaignId: string }): Promise<any> {
    const { campaignId } = params

    const existingCampaign = await Models.Campaign.findExisting({
      pluginAddress: this.address,
      network: this.network,
      campaignId,
    })

    if (existingCampaign?.active) {
      logger.warn(
        'Campaign already exists and is immutable',
        this.llo({
          campaignId,
          campaignActive: existingCampaign.active,
        }),
      )
      assertExposable(false, ErrorKeyEnum.alreadyExists)
    }

    const members = await Models.CampaignReward.find({
      pluginAddress: this.address,
      network: this.network,
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
                pluginAddress: this.address,
                network: this.network,
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
              this.llo({
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
          this.llo({
            campaignId,
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
      logger.warn('Error generating merkle data', this.llo({ error: e, campaignId }))
      return {
        success: false,
      }
    }
  }

  async getCampaignsWithPagination(
    paginationParams: IPaginationParams = {},
    params: ICampaignApiParams = {},
  ): Promise<IPaginatedResult<ICampaignResponse>> {
    const apiParams = {
      ...params,
      pluginAddress: this.address,
      network: this.network,
    }

    return await Models.Campaign.getCampaignsWithPagination({
      paginationParams,
      params: apiParams,
    })
  }

  async getUserCampaignStatus(userAddress: HexAddress): Promise<IUserCampaignStatus> {
    assertExposable(!!userAddress, ErrorKeyEnum.badParams)
    return await Models.CampaignReward.getUserCampaignStatus(this.address, this.network, userAddress)
  }

  async getCampaignDetails(params: { campaignId: string }): Promise<any> {
    const { campaignId } = params

    const campaign = await Models.Campaign.findCampaignById(this.address, this.network, campaignId)
    assertExposable(campaign, ErrorKeyEnum.notFound)

    const members = await Models.CampaignReward.find({
      pluginAddress: this.address,
      network: this.network,
      campaignId,
    })
      .select('id')
      .lean()

    return {
      membersCount: members.length,
      campaignId,
      merkleRoot: campaign.merkleRoot || null,
      active: campaign.active,
    }
  }

  async getUserCampaignReward(params: { campaignId: string; userAddress: HexAddress }): Promise<any> {
    const { campaignId, userAddress } = params

    assertExposable(!!campaignId, ErrorKeyEnum.badParams)
    assertExposable(!!userAddress, ErrorKeyEnum.badParams)

    const reward = await Models.CampaignReward.findRewardForCampaign(
      this.address,
      this.network,
      campaignId,
      userAddress,
    )

    if (!reward) {
      return {
        exists: false,
        campaignId,
        userAddress,
        pluginAddress: this.address,
        network: this.network,
      }
    }

    return {
      exists: true,
      campaignId,
      userAddress: reward.userAddress,
      amount: reward.amount,
      totalClaimed: reward.totalClaimed || '0',
      claims: reward.claims || [],
      proof: reward.proof || null,
      leaf: reward.leaf || null,
      pluginAddress: this.address,
      network: this.network,
      isFullyClaimed: BigInt(reward.totalClaimed || '0') >= BigInt(reward.amount),
    }
  }

  // BaseGovernance compatibility method - CapitalDistributor doesn't track DAO metrics
  async updateDaoMetrics(): Promise<any> {
    logger.info('CapitalDistributor governance does not implement DAO metrics', this.llo({}))
    return null
  }

  // Empty BaseGovernance method implementations
  async getOrCreate(): Promise<any> {
    return null
  }

  async create(): Promise<any> {
    return null
  }

  async update(): Promise<any> {
    return null
  }

  async delete(): Promise<boolean> {
    return false
  }

  async findOne(): Promise<any> {
    return null
  }

  async findAndPaginateMembers(): Promise<IPaginatedResult<IMembersResponse>> {
    return {
      data: [],
      metadata: {
        page: 0,
        pageSize: 0,
        totalPages: 0,
        totalRecords: 0,
      },
    }
  }
}
