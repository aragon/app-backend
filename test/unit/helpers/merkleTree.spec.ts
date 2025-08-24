import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { MerkleTree } from 'merkletreejs'
import { getAddress, solidityPackedKeccak256 } from 'ethers'
import MerkleTreeHelper from '@helpers/merkleTree'
import { type IMerkleTreeLeaf, type IRewardEntry } from '@types'

describe('MerkleTreeHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('createLeaf', () => {
    it('should create a leaf hash from address and amount', () => {
      const leaf: IMerkleTreeLeaf = {
        address: '0x1234567890123456789012345678901234567890',
        amount: '1000000000000000000', // 1 ETH in wei
      }

      const result = MerkleTreeHelper.createLeaf(leaf)

      expect(result).to.be.a('string')
      expect(result).to.match(/^0x[a-f0-9]{64}$/i)

      // Verify it uses solidityPackedKeccak256 with correct parameters
      const expected = solidityPackedKeccak256(['address', 'uint256'], [leaf.address, BigInt(leaf.amount)])
      expect(result).to.equal(expected)
    })

    it('should create different hashes for different addresses', () => {
      const leaf1: IMerkleTreeLeaf = {
        address: '0x1111111111111111111111111111111111111111',
        amount: '1000000000000000000',
      }
      const leaf2: IMerkleTreeLeaf = {
        address: '0x2222222222222222222222222222222222222222',
        amount: '1000000000000000000',
      }

      const hash1 = MerkleTreeHelper.createLeaf(leaf1)
      const hash2 = MerkleTreeHelper.createLeaf(leaf2)

      expect(hash1).to.not.equal(hash2)
    })

    it('should create different hashes for different amounts', () => {
      const leaf1: IMerkleTreeLeaf = {
        address: '0x1234567890123456789012345678901234567890',
        amount: '1000000000000000000',
      }
      const leaf2: IMerkleTreeLeaf = {
        address: '0x1234567890123456789012345678901234567890',
        amount: '2000000000000000000',
      }

      const hash1 = MerkleTreeHelper.createLeaf(leaf1)
      const hash2 = MerkleTreeHelper.createLeaf(leaf2)

      expect(hash1).to.not.equal(hash2)
    })

    it('should handle zero amounts', () => {
      const leaf: IMerkleTreeLeaf = {
        address: '0x1234567890123456789012345678901234567890',
        amount: '0',
      }

      const result = MerkleTreeHelper.createLeaf(leaf)

      expect(result).to.be.a('string')
      expect(result).to.match(/^0x[a-f0-9]{64}$/i)
    })

    it('should handle large amounts', () => {
      const leaf: IMerkleTreeLeaf = {
        address: '0x1234567890123456789012345678901234567890',
        amount: '115792089237316195423570985008687907853269984665640564039457584007913129639935', // Max uint256
      }

      const result = MerkleTreeHelper.createLeaf(leaf)

      expect(result).to.be.a('string')
      expect(result).to.match(/^0x[a-f0-9]{64}$/i)
    })
  })

  describe('generateMerkleTree', () => {
    it('should generate a MerkleTree from leaves', () => {
      const leaves: IMerkleTreeLeaf[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000000000000000000' },
      ]

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)

      expect(tree).to.be.instanceOf(MerkleTree)
      expect(tree.getLeaves()).to.have.length(3)
      expect(tree.getHexRoot()).to.be.a('string')
      expect(tree.getHexRoot()).to.match(/^0x[a-f0-9]{64}$/i)
    })

    it('should generate tree with single leaf', () => {
      const leaves: IMerkleTreeLeaf[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
      ]

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)

      expect(tree).to.be.instanceOf(MerkleTree)
      expect(tree.getLeaves()).to.have.length(1)
      expect(tree.getHexRoot()).to.be.a('string')
    })

    it('should generate consistent trees for same input', () => {
      const leaves: IMerkleTreeLeaf[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
      ]

      const tree1 = MerkleTreeHelper.generateMerkleTree(leaves)
      const tree2 = MerkleTreeHelper.generateMerkleTree(leaves)

      expect(tree1.getHexRoot()).to.equal(tree2.getHexRoot())
    })

    it('should handle empty leaves array', () => {
      const leaves: IMerkleTreeLeaf[] = []

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)

      expect(tree).to.be.instanceOf(MerkleTree)
      expect(tree.getLeaves()).to.have.length(0)
    })
  })

  describe('generateMerkleProof', () => {
    it('should generate proof for a leaf in the tree', () => {
      const leaves: IMerkleTreeLeaf[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000000000000000000' },
      ]

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)
      const target = leaves[0]

      const proof = MerkleTreeHelper.generateMerkleProof(tree, target)

      expect(proof).to.be.an('array')
      expect(proof.length).to.be.greaterThan(0)
      proof.forEach(p => {
        expect(p).to.match(/^0x[a-f0-9]{64}$/i)
      })

      // Verify the proof is valid
      const leaf = MerkleTreeHelper.createLeaf(target)
      const isValid = tree.verify(proof, leaf, tree.getRoot())
      expect(isValid).to.be.true
    })

    it('should generate different proofs for different leaves', () => {
      const leaves: IMerkleTreeLeaf[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000000000000000000' },
      ]

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)

      const proof1 = MerkleTreeHelper.generateMerkleProof(tree, leaves[0])
      const proof2 = MerkleTreeHelper.generateMerkleProof(tree, leaves[1])

      expect(proof1).to.not.deep.equal(proof2)
    })

    it('should generate empty proof for single leaf tree', () => {
      const leaves: IMerkleTreeLeaf[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
      ]

      const tree = MerkleTreeHelper.generateMerkleTree(leaves)
      const proof = MerkleTreeHelper.generateMerkleProof(tree, leaves[0])

      expect(proof).to.be.an('array')
      expect(proof).to.have.length(0)
    })
  })

  describe('generateTreeWithProofs', () => {
    it('should generate tree with proofs for all members', () => {
      const rewards: IRewardEntry[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000000000000000000' },
      ]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result).to.have.property('merkleRoot')
      expect(result).to.have.property('members')
      expect(result.merkleRoot).to.match(/^0x[a-f0-9]{64}$/i)
      expect(result.members).to.have.length(3)

      result.members.forEach((member, index) => {
        expect(member).to.have.property('address')
        expect(member).to.have.property('amount')
        expect(member).to.have.property('proof')
        expect(member).to.have.property('leaf')

        expect(member.address).to.equal(getAddress(rewards[index].address))
        expect(member.amount).to.equal(rewards[index].amount)
        expect(member.proof).to.be.an('array')
        expect(member.leaf).to.match(/^0x[a-f0-9]{64}$/i)
      })
    })

    it('should generate checksummed addresses', () => {
      const rewards: IRewardEntry[] = [
        { address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', amount: '1000000000000000000' }, // lowercase
        { address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', amount: '2000000000000000000' }, // mixed case
      ]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      result.members.forEach((member, index) => {
        expect(member.address).to.equal(getAddress(rewards[index].address))
        expect(member.address).to.not.equal(rewards[index].address.toLowerCase())
      })
    })

    it('should generate valid proofs for all members', () => {
      const rewards: IRewardEntry[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
        { address: '0x3333333333333333333333333333333333333333', amount: '3000000000000000000' },
      ]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      // Create tree to verify proofs
      const leaves = rewards.map(reward => ({
        address: reward.address,
        amount: reward.amount,
      }))
      const tree = MerkleTreeHelper.generateMerkleTree(leaves)

      result.members.forEach(member => {
        const isValid = tree.verify(member.proof, member.leaf, tree.getRoot())
        expect(isValid).to.be.true
      })
    })

    it('should handle single reward entry', () => {
      const rewards: IRewardEntry[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
      ]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result.merkleRoot).to.match(/^0x[a-f0-9]{64}$/i)
      expect(result.members).to.have.length(1)
      expect(result.members[0].proof).to.be.an('array')
      expect(result.members[0].proof).to.have.length(0) // Single leaf has empty proof
    })

    it('should handle zero amounts', () => {
      const rewards: IRewardEntry[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '0' },
        { address: '0x2222222222222222222222222222222222222222', amount: '1000000000000000000' },
      ]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result.merkleRoot).to.match(/^0x[a-f0-9]{64}$/i)
      expect(result.members).to.have.length(2)
      expect(result.members[0].amount).to.equal('0')
      expect(result.members[1].amount).to.equal('1000000000000000000')
    })

    it('should handle large amounts', () => {
      const largeAmount = '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      const rewards: IRewardEntry[] = [{ address: '0x1111111111111111111111111111111111111111', amount: largeAmount }]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result.merkleRoot).to.match(/^0x[a-f0-9]{64}$/i)
      expect(result.members).to.have.length(1)
      expect(result.members[0].amount).to.equal(largeAmount)
    })

    it('should throw error when processing fails', () => {
      // Mock getAddress to throw an error
      sandbox.stub(getAddress).throws(new Error('Invalid address'))

      const rewards: IRewardEntry[] = [{ address: 'invalid-address', amount: '1000000000000000000' }]

      expect(() => MerkleTreeHelper.generateTreeWithProofs(rewards)).to.throw()
    })

    it('should handle empty rewards array', () => {
      const rewards: IRewardEntry[] = []

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result.merkleRoot).to.be.a('string')
      expect(result.members).to.be.an('array')
      expect(result.members).to.have.length(0)
    })

    it('should generate consistent results for same input', () => {
      const rewards: IRewardEntry[] = [
        { address: '0x1111111111111111111111111111111111111111', amount: '1000000000000000000' },
        { address: '0x2222222222222222222222222222222222222222', amount: '2000000000000000000' },
      ]

      const result1 = MerkleTreeHelper.generateTreeWithProofs(rewards)
      const result2 = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result1.merkleRoot).to.equal(result2.merkleRoot)
      expect(result1.members).to.deep.equal(result2.members)
    })

    it('should handle duplicate addresses with different amounts', () => {
      const rewards: IRewardEntry[] = [
        { address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', amount: '1000000000000000000' },
        { address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', amount: '2000000000000000000' },
      ]

      const result = MerkleTreeHelper.generateTreeWithProofs(rewards)

      expect(result.merkleRoot).to.match(/^0x[a-f0-9]{64}$/i)
      expect(result.members).to.have.length(2)
      expect(result.members[0].address).to.equal(result.members[1].address)
      expect(result.members[0].amount).to.not.equal(result.members[1].amount)
      expect(result.members[0].leaf).to.not.equal(result.members[1].leaf)
    })
  })
})
