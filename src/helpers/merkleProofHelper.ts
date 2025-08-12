import MerkleTreeHelper, { type IRewardEntry, type IMerkleProof } from '@helpers/merkleTree'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helpers:MerkleProofHelper' })

export interface IUserRewardWithProof {
  address: string
  amount: string
  proof: string[] | null
  leaf: string | null
}

const MerkleProofHelper = {
  generateProofForUserFromList: (rewards: IRewardEntry[], targetUserAddress: string): IMerkleProof | null => {
    try {
      if (!rewards || rewards.length === 0) {
        logger.warn('No rewards provided for proof generation', llo({ targetUserAddress }))
        return null
      }

      const treeResult = MerkleTreeHelper.generateMerkleTree(rewards)
      const userProof = MerkleTreeHelper.generateProofForAddress(treeResult.tree, targetUserAddress)

      if (!userProof) {
        logger.warn(
          'User not found in reward list',
          llo({
            targetUserAddress,
            totalRewards: rewards.length,
          }),
        )
        return null
      }

      logger.debug(
        'Generated proof for user from list',
        llo({
          targetUserAddress,
          totalRewards: rewards.length,
          proofLength: userProof.proof.length,
          amount: userProof.amount,
        }),
      )

      return userProof
    } catch (error) {
      logger.error(
        'Error generating proof for user from list',
        llo({
          error,
          targetUserAddress,
          totalRewards: rewards?.length,
        }),
      )
      throw error
    }
  },

  attachProofsToRewardList: (rewards: IRewardEntry[]): IUserRewardWithProof[] => {
    try {
      if (!rewards || rewards.length === 0) {
        return []
      }

      const treeResult = MerkleTreeHelper.generateMerkleTree(rewards)
      const allProofs = MerkleTreeHelper.generateAllProofs(treeResult.tree)

      const rewardsWithProofs: IUserRewardWithProof[] = rewards.map(reward => {
        const proof = allProofs.get(reward.address.toLowerCase())

        return {
          address: reward.address,
          amount: reward.amount,
          proof: proof ? proof.proof : null,
          leaf: proof ? proof.leaf : null,
        }
      })

      logger.info(
        'Attached proofs to reward list',
        llo({
          totalRewards: rewards.length,
          proofsGenerated: allProofs.size,
        }),
      )

      return rewardsWithProofs
    } catch (error) {
      logger.error(
        'Error attaching proofs to reward list',
        llo({
          error,
          totalRewards: rewards?.length,
        }),
      )
      throw error
    }
  },

  attachProofToPaginatedList: <T extends { address: string; amount: string }>(
    paginatedRewards: T[],
    allRewards: IRewardEntry[],
  ): Array<T & { proof: string[] | null; leaf: string | null }> => {
    try {
      if (!paginatedRewards || paginatedRewards.length === 0) {
        return []
      }

      if (!allRewards || allRewards.length === 0) {
        logger.warn('No complete reward list provided for proof generation')
        return paginatedRewards.map(reward => ({
          ...reward,
          proof: null,
          leaf: null,
        }))
      }

      const treeResult = MerkleTreeHelper.generateMerkleTree(allRewards)

      const enrichedRewards = paginatedRewards.map(reward => {
        const userProof = MerkleTreeHelper.generateProofForAddress(treeResult.tree, reward.address)

        return {
          ...reward,
          proof: userProof ? userProof.proof : null,
          leaf: userProof ? userProof.leaf : null,
        }
      })

      logger.info(
        'Attached proofs to paginated list',
        llo({
          paginatedCount: paginatedRewards.length,
          totalRewards: allRewards.length,
          proofsGenerated: enrichedRewards.filter(r => r.proof !== null).length,
        }),
      )

      return enrichedRewards
    } catch (error) {
      logger.error(
        'Error attaching proofs to paginated list',
        llo({
          error,
          paginatedCount: paginatedRewards?.length,
          totalRewards: allRewards?.length,
        }),
      )
      throw error
    }
  },

  getMerkleRootFromRewards: (rewards: IRewardEntry[]): string | null => {
    try {
      if (!rewards || rewards.length === 0) {
        return null
      }

      const treeResult = MerkleTreeHelper.generateMerkleTree(rewards)

      logger.debug(
        'Generated merkle root from rewards',
        llo({
          totalRewards: rewards.length,
          merkleRoot: treeResult.merkleRoot,
        }),
      )

      return treeResult.merkleRoot
    } catch (error) {
      logger.error(
        'Error generating merkle root from rewards',
        llo({
          error,
          totalRewards: rewards?.length,
        }),
      )
      return null
    }
  },
}

export default MerkleProofHelper
