import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { solidityPackedKeccak256, getAddress } from 'ethers'
import logger from '@logger'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:MerkleTree' })

export interface IRewardEntry {
  address: string
  amount: string
}

export interface IMerkleProof {
  proof: string[]
  leaf: string
  amount: string
}

export interface IMerkleTreeResult {
  merkleRoot: string
  tree: StandardMerkleTree<[string, string]>
}

const MerkleTreeHelper = {
  generateMerkleTree: (rewards: IRewardEntry[]): IMerkleTreeResult => {
    try {
      if (!rewards || rewards.length === 0) {
        throw new Error('No rewards provided for merkle tree generation')
      }

      const sortedRewards = rewards
        .map(reward => ({
          address: getAddress(reward.address.toLowerCase()),
          amount: reward.amount,
        }))
        .sort((a, b) => a.address.localeCompare(b.address))

      const values: [string, string][] = sortedRewards.map(reward => [reward.address, reward.amount])

      const tree = StandardMerkleTree.of(values, ['address', 'uint256'])
      const merkleRoot = tree.root

      logger.info(
        'Merkle tree generated successfully',
        llo({
          entryCount: rewards.length,
          merkleRoot,
          sortedCount: sortedRewards.length,
        }),
      )

      return {
        merkleRoot,
        tree,
      }
    } catch (error) {
      logger.error('Error generating merkle tree', llo({ error, rewardCount: rewards?.length }))
      throw error
    }
  },

  generateProofForAddress: (tree: StandardMerkleTree<[string, string]>, userAddress: string): IMerkleProof | null => {
    try {
      const normalizedAddress = getAddress(userAddress.toLowerCase())

      for (const [i, v] of tree.entries()) {
        const [address, amount] = v
        if (getAddress(address.toLowerCase()) === normalizedAddress) {
          const proof = tree.getProof(i)
          const leaf = tree.leafHash(v)

          logger.debug(
            'Proof generated for address',
            llo({
              address: normalizedAddress,
              amount,
              proofLength: proof.length,
              leaf,
            }),
          )

          return {
            proof,
            leaf,
            amount,
          }
        }
      }

      logger.warn('Address not found in merkle tree', llo({ address: normalizedAddress }))
      return null
    } catch (error) {
      logger.error('Error generating proof for address', llo({ error, userAddress }))
      throw error
    }
  },

  generateAllProofs: (tree: StandardMerkleTree<[string, string]>): Map<string, IMerkleProof> => {
    try {
      const proofs = new Map<string, IMerkleProof>()

      for (const [i, v] of tree.entries()) {
        const [address, amount] = v
        const normalizedAddress = getAddress(address.toLowerCase())
        const proof = tree.getProof(i)
        const leaf = tree.leafHash(v)

        proofs.set(normalizedAddress, {
          proof,
          leaf,
          amount,
        })
      }

      logger.info(
        'Generated proofs for all addresses',
        llo({
          totalProofs: proofs.size,
        }),
      )

      return proofs
    } catch (error) {
      logger.error('Error generating all proofs', llo({ error }))
      throw error
    }
  },

  verifyProof: (merkleRoot: string, userAddress: string, amount: string, proof: string[]): boolean => {
    try {
      const normalizedAddress = getAddress(userAddress.toLowerCase())

      const isValid = StandardMerkleTree.verify(merkleRoot, ['address', 'uint256'], [normalizedAddress, amount], proof)

      logger.debug(
        'Proof verification result',
        llo({
          address: normalizedAddress,
          amount,
          merkleRoot,
          proofLength: proof.length,
          isValid,
        }),
      )

      return isValid
    } catch (error) {
      logger.error('Error verifying proof', llo({ error, userAddress, amount, merkleRoot }))
      return false
    }
  },

  encodeClaimData: (proof: IMerkleProof): string => {
    try {
      const encodedData = solidityPackedKeccak256(['bytes32[]', 'uint256'], [proof.proof, proof.amount])

      logger.debug(
        'Claim data encoded',
        llo({
          proofLength: proof.proof.length,
          amount: proof.amount,
          encodedData,
        }),
      )

      return encodedData
    } catch (error) {
      logger.error('Error encoding claim data', llo({ error, proof }))
      throw error
    }
  },

  reconstructTreeFromRewards: async (
    pluginAddress: string,
    network: NetworksEnum,
    campaignId: string,
    rewards: IRewardEntry[],
  ): Promise<IMerkleTreeResult> => {
    try {
      logger.info(
        'Reconstructing merkle tree from rewards',
        llo({
          pluginAddress,
          network,
          campaignId,
          rewardCount: rewards.length,
        }),
      )

      const treeResult = MerkleTreeHelper.generateMerkleTree(rewards)

      logger.info(
        'Merkle tree reconstructed successfully',
        llo({
          pluginAddress,
          network,
          campaignId,
          merkleRoot: treeResult.merkleRoot,
          entryCount: rewards.length,
        }),
      )

      return treeResult
    } catch (error) {
      logger.error(
        'Error reconstructing merkle tree',
        llo({
          error,
          pluginAddress,
          network,
          campaignId,
        }),
      )
      throw error
    }
  },
}

export default MerkleTreeHelper
