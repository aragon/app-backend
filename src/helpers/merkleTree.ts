import { MerkleTree } from 'merkletreejs'
import { ethers, getAddress, solidityPackedKeccak256 } from 'ethers'
import { type IMemberWithProof, type IMerkleTreeLeaf, type IMerkleTreeWithProofs, type IRewardEntry } from '@types'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'MerkleTreeHelper' })
const MerkleTreeHelper = {
  createLeaf: (leaf: IMerkleTreeLeaf): string => {
    const { address, amount } = leaf

    return solidityPackedKeccak256(['address', 'uint256'], [address, BigInt(amount)])
  },

  generateMerkleTree: (leaves: IMerkleTreeLeaf[]): MerkleTree => {
    return new MerkleTree(leaves.map(MerkleTreeHelper.createLeaf), ethers.keccak256, { sortPairs: true })
  },

  generateMerkleProof: (tree: MerkleTree, target: IMerkleTreeLeaf): string[] => {
    const leaf = MerkleTreeHelper.createLeaf(target)
    return tree.getHexProof(leaf)
  },

  generateTreeWithProofs: async (rewards: IRewardEntry[]): Promise<IMerkleTreeWithProofs> => {
    try {
      const leaves: IMerkleTreeLeaf[] = rewards.map(reward => ({
        address: reward.address,
        amount: reward.amount,
      }))

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)
      const merkleRoot = tree.getHexRoot()

      const members: IMemberWithProof[] = await MerkleTreeHelper.grabMembersWithProof(rewards, tree)

      return {
        merkleRoot,
        members,
      }
    } catch (error) {
      throw error
    }
  },

  grabMembersWithProof: async (
    rewards: IRewardEntry[],
    tree: any,
    batchSize: number = 1000,
  ): Promise<IMemberWithProof[]> => {
    const members: IMemberWithProof[] = []

    for (let i = 0; i < rewards.length; i += batchSize) {
      const batch = rewards.slice(i, i + batchSize)

      const batchMembers = batch.map(reward => {
        const target = { address: reward.address, amount: reward.amount }
        const proof = MerkleTreeHelper.generateMerkleProof(tree, target)
        const leaf = MerkleTreeHelper.createLeaf(target)

        return {
          address: getAddress(reward.address),
          amount: reward.amount,
          proof,
          leaf,
        }
      })

      members.push(...batchMembers)
      await new Promise(resolve => setImmediate(resolve))

      if (i % (batchSize * 10) === 0) {
        logger.info('Processed proofs', llo({ processed: i, total: rewards.length }))
      }
    }

    return members
  },
}

export default MerkleTreeHelper
