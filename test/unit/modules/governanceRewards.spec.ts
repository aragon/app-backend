import { Models } from '@dbModels'
import GovernanceVeHelper from '@helpers/governanceVe'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import GovernanceRewards from '@modules/governanceRewards'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PLUGIN = '0x1652FDd272fEf49B53bd102550DE775519e60b8E'
const ADAPTER = '0xA01de789D297B568A20e462660E3e9fB5553677e'
const ESCROW = '0x44a86a9feAfbC841Fa5e4f2da828e1A2e9692DFc'
const DAO = '0x5b0348810D4576d2B6002214aF0608318748b9A6'
const NETWORK = NetworksEnum.ethereumSepolia
const TOTAL = 1000000000000000000000n
const TX = '0x0000000000000000000000000000000000000000000000000000000000000001'

const ALICE = '0x000000000000000000000000000000000000aAaA'
const BOB = '0x000000000000000000000000000000000000bBbB'
const CAROL = '0x000000000000000000000000000000000000CcCc'

describe('GovernanceRewards', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('distribute', () => {
    it('should distribute pro-rata with dust to largest recipient', () => {
      const weights = new Map<string, bigint>([
        [ALICE, 200n],
        [BOB, 100n],
      ])

      const result = GovernanceRewards.distribute(weights, 1000n)

      expect(result).to.have.lengthOf(2)
      const alice = result.find(r => r.address === ALICE)!
      const bob = result.find(r => r.address === BOB)!
      expect(alice.amount + bob.amount).to.equal(1000n)
      expect(alice.amount).to.equal(667n)
      expect(bob.amount).to.equal(333n)
    })

    it('should return empty array when total weight is zero', () => {
      const weights = new Map<string, bigint>()
      const result = GovernanceRewards.distribute(weights, 1000n)
      expect(result).to.have.lengthOf(0)
    })

    it('should handle single staker getting full amount', () => {
      const weights = new Map<string, bigint>([[ALICE, 100n]])
      const result = GovernanceRewards.distribute(weights, 1000n)
      expect(result).to.have.lengthOf(1)
      expect(result[0].amount).to.equal(1000n)
    })
  })

  describe('compute', () => {
    async function seedPlugin() {
      await Models.Plugin.create({
        id: `${NETWORK}-${PLUGIN}-0`,
        transactionHash: TX,
        blockNumber: 1,
        network: NETWORK,
        address: PLUGIN,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        tokenAddress: ADAPTER,
        daoAddress: DAO,
        isSupported: true,
      })
    }

    function stubEscrow() {
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
    }

    async function seedDelegation(delegator: string, tokenIds: string[], blockNumber: number, logIndex = 0) {
      await Models.TokenDelegation.create({
        id: `${NETWORK}-deleg-${blockNumber}-${logIndex}`,
        contractAddress: ADAPTER,
        network: NETWORK,
        delegator,
        delegate: delegator,
        tokenIds,
        action: 'delegate',
        blockNumber,
        blockTimestamp: 1700000000 + blockNumber,
        logIndex,
        transactionIndex: 0,
        transactionHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
      })
    }

    async function seedProposal(index: string, blockTimestamp: number, endDate: number) {
      await Models.Proposal.create({
        id: `${NETWORK}-${PLUGIN}-${index}`,
        proposalIndex: index,
        pluginAddress: PLUGIN,
        network: NETWORK,
        blockNumber: 200,
        blockTimestamp,
        endDate,
        startDate: blockTimestamp,
        transactionHash: `0x${index.padStart(64, '0')}`,
        creatorAddress: ALICE,
        daoAddress: DAO,
      })
    }

    async function seedVote(proposalIndex: string, voter: string, logIndex: number) {
      await Models.Vote.create({
        id: `${NETWORK}-${PLUGIN}-${proposalIndex}-${voter}`,
        proposalIndex,
        pluginAddress: PLUGIN,
        network: NETWORK,
        daoAddress: DAO,
        memberAddress: voter,
        voteOption: 1,
        votingPower: '100',
        blockNumber: 201,
        logIndex,
        transactionIndex: 0,
        transactionHash: `0x${voter.slice(2).padStart(64, '0')}`,
      })
    }

    it('should return error when plugin not found', async () => {
      const result = await new GovernanceRewards({
        pluginAddress: '0x0000000000000000000000000000000000000000',
        network: NETWORK,
        totalAmount: TOTAL,
        lookbackDate: '2025-01-01T00:00:00.000Z',
      }).compute()

      expect(result).to.have.property('error')
    })

    it('should return error when escrow address not found', async () => {
      await seedPlugin()
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null as any)

      const result = await new GovernanceRewards({
        pluginAddress: PLUGIN,
        network: NETWORK,
        totalAmount: TOTAL,
        lookbackDate: '2025-01-01T00:00:00.000Z',
      }).compute()

      expect(result).to.have.property('error')
    })

    it('should return empty array when no proposals and no delegations', async () => {
      await seedPlugin()
      stubEscrow()

      const result = await new GovernanceRewards({
        pluginAddress: PLUGIN,
        network: NETWORK,
        totalAmount: TOTAL,
        lookbackDate: '2025-01-01T00:00:00.000Z',
      }).compute()

      expect(result).to.be.an('array').with.lengthOf(0)
    })

    it('should distribute by current VP when no proposals but delegations exist', async () => {
      await seedPlugin()
      stubEscrow()
      await seedDelegation(ALICE, ['1'], 100)
      await seedDelegation(BOB, ['2'], 101)

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([
        { tokenId: '1', votingPower: 600000000000000000000n },
        { tokenId: '2', votingPower: 400000000000000000000n },
      ])

      const result = await new GovernanceRewards({
        pluginAddress: PLUGIN,
        network: NETWORK,
        totalAmount: TOTAL,
        lookbackDate: new Date(Date.now() - 1000).toISOString(),
      }).compute()

      expect(result).to.be.an('array').with.lengthOf(2)
      const rewards = result as Array<{ address: string; amount: bigint }>
      const total = rewards.reduce((sum, r) => sum + r.amount, 0n)
      expect(total).to.equal(TOTAL)
    })

    it('should compute rewards based on delegate voting participation', async () => {
      await seedPlugin()
      stubEscrow()

      const proposalTs = Math.floor(Date.now() / 1000) - 86400
      const endTs = Math.floor(Date.now() / 1000) - 3600
      const lookbackDate = new Date((endTs - 172800) * 1000).toISOString()

      await seedProposal('prop-1', proposalTs, endTs)
      await seedVote('prop-1', ALICE, 0)
      await seedVote('prop-1', CAROL, 1)

      await seedDelegation(ALICE, ['1'], 50)
      await seedDelegation(BOB, ['2'], 51)
      await seedDelegation(CAROL, ['3'], 52)

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([
        { tokenId: '1', votingPower: 600000000000000000000n },
        { tokenId: '3', votingPower: 400000000000000000000n },
      ])

      const result = await new GovernanceRewards({
        pluginAddress: PLUGIN,
        network: NETWORK,
        totalAmount: TOTAL,
        lookbackDate,
      }).compute()

      expect(result).to.be.an('array').with.lengthOf(2)

      const rewards = result as Array<{ address: string; amount: bigint }>
      const alice = rewards.find(r => r.address === ALICE)!
      const carol = rewards.find(r => r.address === CAROL)!

      expect(alice.amount).to.equal(600000000000000000000n)
      expect(carol.amount).to.equal(400000000000000000000n)
      expect(alice.amount + carol.amount).to.equal(TOTAL)

      const bob = rewards.find(r => r.address === BOB)
      expect(bob).to.be.undefined
    })

    it('should skip proposals with no votes', async () => {
      await seedPlugin()
      stubEscrow()

      const proposalTs = Math.floor(Date.now() / 1000) - 86400
      const endTs = Math.floor(Date.now() / 1000) - 3600
      const lookbackDate = new Date((endTs - 172800) * 1000).toISOString()

      await seedProposal('prop-empty', proposalTs, endTs)

      const result = await new GovernanceRewards({
        pluginAddress: PLUGIN,
        network: NETWORK,
        totalAmount: TOTAL,
        lookbackDate,
      }).compute()

      expect(result).to.be.an('array').with.lengthOf(0)
    })
  })
})
