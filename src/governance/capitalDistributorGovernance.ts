import { Models } from '@dbModels'
import { assertExposable } from '@errors'
import MerkleTreeHelper from '@helpers/merkleTree'
import Utils from '@helpers/utils'
import logger from '@logger'
import {
  ErrorKeyEnum,
  type HexAddress,
  type IAAddMembersListParams,
  type ICampaignApiParams,
  type ICampaignPrepareStatus,
  type ICampaignResponse,
  type ICampaignUploadResult,
  type IMembersResponse,
  type IMerkleProofSync,
  type IPaginatedResult,
  type IPaginationParams,
  type IUserCampaignStatus,
  type NetworksEnum,
} from '@types'
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

  async uploadMembersList(params: IAAddMembersListParams): Promise<ICampaignUploadResult> {
    const { campaignId, pluginAddress, network, rewards } = params

    const existingCampaign = await Models.Campaign.findExisting({
      pluginAddress,
      network,
      campaignId,
    })

    if (existingCampaign?.active || existingCampaign?.ended) {
      assertExposable(false, ErrorKeyEnum.campaignInvalid)
    }

    const uniqueAddresses = new Set(rewards.map(reward => reward.address.toLowerCase()))
    assertExposable(uniqueAddresses.size === rewards.length, ErrorKeyEnum.duplicateAddresses)

    const validAddresses = rewards.every(reward => ethers.isAddress(reward.address))
    assertExposable(validAddresses, ErrorKeyEnum.badParams)

    return await this.bulkUpsertRewards(campaignId, rewards)
  }

  private async bulkUpsertRewards(
    campaignId: string,
    rewards: Array<{ address: string; amount: string }>,
  ): Promise<ICampaignUploadResult> {
    const existingDocs = await Models.CampaignReward.find(
      { pluginAddress: this.address, network: this.network, campaignId },
      { id: 1 },
    ).lean()
    const existingIds = new Set(existingDocs.map((d: any) => d.id as string))

    const upsertOps = rewards.map(({ address, amount }, index) => {
      const userAddress = ethers.getAddress(address)
      const id = Models.CampaignReward.getEntityId({
        pluginAddress: this.address,
        network: this.network,
        campaignId,
        userAddress: userAddress as HexAddress,
      })
      return {
        updateOne: {
          filter: { id },
          update: {
            $set: { amount, index },
            $setOnInsert: {
              id,
              pluginAddress: this.address,
              network: this.network,
              campaignId,
              userAddress,
              claims: [],
              totalClaimed: '0',
            },
          },
          upsert: true,
        },
      }
    })

    const newIds = new Set(upsertOps.map(op => op.updateOne.filter.id))
    let totalInserted = 0
    let totalUpdated = 0
    for (const id of newIds) {
      if (existingIds.has(id)) totalUpdated++
      else totalInserted++
    }

    let failedChunks = 0
    if (upsertOps.length > 0) {
      const chunks = Utils.chunkArray(upsertOps, BATCH_SIZE)
      await Utils.processParallel(
        chunks,
        async (chunk: any[]) => {
          await Models.CampaignReward.bulkWrite(chunk, { ordered: false })
        },
        {
          concurrency: CONCURRENCY_LIMIT,
          batchSize: BATCH_SIZE,
          onError: (error: any, chunk: any, idx: any) => {
            failedChunks++
            logger.error(
              'Error processing upsert chunk',
              this.llo({ error, chunkIndex: idx, chunkSize: chunk?.length, campaignId }),
            )
          },
        },
      )
    }

    const toDelete: any[] = []
    for (const id of existingIds) {
      if (!newIds.has(id)) toDelete.push(id)
    }
    if (toDelete.length > 0) {
      await Models.CampaignReward.deleteMany({ id: { $in: toDelete } })
    }
    const totalDeleted = toDelete.length

    const success = failedChunks === 0
    const message = success
      ? 'Members list replaced successfully'
      : 'Members list replace completed with chunk failures'

    logger.info(
      message,
      this.llo({
        campaignId,
        totalInserted,
        totalUpdated,
        totalDeleted,
        totalProcessed: rewards.length,
        failedChunks,
      }),
    )

    return {
      success,
      message,
      totalInserted,
      totalUpdated,
      totalDeleted,
      totalProcessed: rewards.length,
      campaignId,
    }
  }

  async generateMerkleData(params: { campaignId: string }): Promise<any> {
    const { campaignId } = params

    const existingCampaign = await Models.Campaign.findExisting({
      pluginAddress: this.address,
      network: this.network,
      campaignId,
    })

    if (existingCampaign?.active || existingCampaign?.ended) {
      assertExposable(false, ErrorKeyEnum.campaignInvalid)
    }

    const members = await Models.CampaignReward.find({
      pluginAddress: this.address,
      network: this.network,
      campaignId,
    })
      .sort({ index: 1 })
      .lean()

    assertExposable(members && members.length > 0, ErrorKeyEnum.badParams)

    const rewardEntries = members.map((member: any) => ({
      address: member.userAddress,
      amount: member.amount,
    }))

    try {
      logger.info('Generating merkle data', this.llo({ campaignId }))

      const timerStart = Date.now()
      const merkleResult = await MerkleTreeHelper.generateTreeWithProofs(rewardEntries)

      logger.info('Merkle tree generated', this.llo({ campaignId, durationMs: Date.now() - timerStart }))

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

        const writeResult = await Models.CampaignReward.bulkWrite(bulkOps)
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
        onProgress: (processed: number, total: number) => {
          logger.info('Merkle proof update progress', this.llo({ campaignId, processed, total }))
        },
      })

      const totalUpdated = updateResults.reduce((sum: any, count: any) => sum + count, 0)

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

  async getCampaignDetails(params: { campaignId: string }): Promise<ICampaignPrepareStatus> {
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
      totalMembers: members.length,
      campaignId,
      merkleRoot: campaign.merkleRoot || null,
      pluginAddress: this.address,
      network: this.network,
    }
  }

  async getMerkleGenerationStatus(params: IMerkleProofSync) {
    const { campaignId, pluginAddress, network } = params
    const campaignMerkleRoot = await Models.CampaignMerkleRoot.findByParams(pluginAddress, network, campaignId)

    if (!campaignMerkleRoot) {
      return null
    }

    return {
      campaignId: campaignMerkleRoot.campaignId,
      pluginAddress: campaignMerkleRoot.pluginAddress,
      network: campaignMerkleRoot.network,
      merkleRoot: campaignMerkleRoot.merkleRoot,
      totalMembers: campaignMerkleRoot.totalMembers,
    }
  }

  async getUserCampaignReward(params: { campaignId: string; userAddress: HexAddress }): Promise<any> {
    const { campaignId, userAddress } = params

    assertExposable(!!campaignId, ErrorKeyEnum.badParams)
    assertExposable(!!userAddress, ErrorKeyEnum.badParams)

    const [reward, campaign] = await Promise.all([
      Models.CampaignReward.findRewardForCampaign(this.address, this.network, campaignId, userAddress),
      Models.Campaign.findCampaignById(this.address, this.network, campaignId),
    ])

    if (!reward) {
      return {
        exists: false,
        campaignId,
        userAddress,
        pluginAddress: this.address,
        network: this.network,
      }
    }

    const isClaimable = !!campaign?.active && !campaign?.ended

    return {
      exists: true,
      campaignId,
      userAddress: reward.userAddress,
      amount: reward.amount,
      totalClaimed: reward.totalClaimed || '0',
      claims: reward.claims || [],
      proof: isClaimable ? reward.proof || null : null,
      leaf: isClaimable ? reward.leaf || null : null,
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
