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
  type IMerkleProofSync,
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

      await Models.CampaignReward.deleteMany(
        {
          pluginAddress: this.address,
          network: this.network,
          campaignId,
        },
        { session },
      )

      const insertOps = rewards.map(({ address, amount }) => {
        const normalizedAddress = ethers.getAddress(address)
        const existingReward = existingRewardsMap.get(normalizedAddress.toLowerCase())

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
              totalClaimed: (existingReward as any)?.totalClaimed || '0',
              claims: (existingReward as any)?.claims || [],
            },
          },
        }
      })

      if (insertOps.length > 0) {
        const insertChunks = Utils.chunkArray(insertOps, BATCH_SIZE)

        const insertProcessor = async (chunk: any[]) => {
          const writeResult = await Models.CampaignReward.bulkWrite(chunk, { session })
          return writeResult.insertedCount || 0
        }

        const insertResults = await Utils.processParallel(insertChunks, insertProcessor, {
          concurrency: CONCURRENCY_LIMIT,
          batchSize: BATCH_SIZE,
          onError: (error: any, chunk: any, index: any) => {
            logger.error(
              'Error processing insert chunk',
              this.llo({
                error,
                chunkIndex: index,
                chunkSize: chunk?.length,
                campaignId,
              }),
            )
          },
        })

        totalInserted = insertResults.reduce((sum: any, count: any) => sum + count, 0)
      }

      totalDeleted = existingRewards.length
      totalUpdated = existingRewards.filter((existing: any) =>
        newRewardsMap.has(existing.userAddress.toLowerCase()),
      ).length

      await session.commitTransaction()
      await session.endSession()

      logger.info(
        'Members list replaced successfully with preserved claims',
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
        message: 'Members list replaced successfully',
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

    if (existingCampaign?.active || existingCampaign?.ended) {
      assertExposable(false, ErrorKeyEnum.campaignInvalid)
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
