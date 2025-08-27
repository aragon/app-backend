import { MerkleTree } from 'merkletreejs'
import { ethers, getAddress, solidityPackedKeccak256 } from 'ethers'
import { type IMemberWithProof, type IMerkleTreeLeaf, type IMerkleTreeWithProofs, type IRewardEntry } from '@types'

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

  generateTreeWithProofs: (rewards: IRewardEntry[]): IMerkleTreeWithProofs => {
    try {
      const leaves: IMerkleTreeLeaf[] = rewards.map(reward => ({
        address: reward.address,
        amount: reward.amount,
      }))

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)
      const merkleRoot = tree.getHexRoot()

      const members: IMemberWithProof[] = rewards.map(reward => {
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

      return {
        merkleRoot,
        members,
      }
    } catch (error) {
      throw error
    }
  },
}

export default MerkleTreeHelper
