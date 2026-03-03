import config from '@config'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Models } from '@dbModels'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import VeRewardDistribution from '@modules/veRewardDistribution'
import { type ActiveVoter, type RewardDistributionResult, type RewardEntry, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PLUGIN = '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'
const CLOCK = '0x1111111111111111111111111111111111111111'
const ESCROW = '0x2222222222222222222222222222222222222222'
const ADAPTER = '0x3333333333333333333333333333333333333333'
const LOCK_NFT = '0x4444444444444444444444444444444444444444'
const ALICE = '0x000000000000000000000000000000000000aaaa'
const BOB = '0x000000000000000000000000000000000000BbBB'
const JORDAN = '0x000000000000000000000000000000000000CcCc'
const NETWORK = NetworksEnum.ethereumMainnet

const VP_60 = 60000000000000000000n
const VP_40 = 40000000000000000000n
const VP_50 = 50000000000000000000n
const VP_150 = 150000000000000000000n
const GAUGE_B = '0x5555555555555555555555555555555555555555'
const REWARD_TOTAL = 3000n

function stubInitSuccess(sandbox: SinonSandbox) {
  sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
  sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
  sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
  sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
  sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
  sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 1000 })
  sandbox.stub(VeRewardDistribution.prototype, 'validateEpochWindow').returns(null)
}

function assertSuccess(
  result: RewardDistributionResult | { error: string } | null,
): asserts result is RewardDistributionResult {
  expect(result).to.not.be.null
  if (typeof result === 'object' && result !== null && 'error' in result) {
    throw new Error((result as { error: string }).error)
  }
}

describe('VeRewardDistribution', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('computeOwnerRewards', () => {
    it('should group entries by owner and compute rewardAmount', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })

      const entries: RewardEntry[] = [
        { tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_60 },
        { tokenId: '2', owner: ALICE, voter: ALICE, votingPower: VP_40 },
        { tokenId: '3', owner: BOB, voter: BOB, votingPower: VP_50 },
      ]

      const result = instance.computeOwnerRewards(entries, VP_150)

      expect(result).to.have.lengthOf(2)

      const alice = result.find(r => r.owner === ALICE)!
      expect(alice.tokenIds).to.deep.equal(['1', '2'])
      expect(alice.votingPower).to.equal(VP_60 + VP_40)
      expect(alice.rewardAmount).to.equal(2000n)

      const bob = result.find(r => r.owner === BOB)!
      expect(bob.tokenIds).to.deep.equal(['3'])
      expect(bob.votingPower).to.equal(VP_50)
      expect(bob.rewardAmount).to.equal(1000n)
    })

    it('should return 0n rewardAmount when onChainTotal is 0n', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })

      const entries: RewardEntry[] = [{ tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_60 }]

      const result = instance.computeOwnerRewards(entries, 0n)

      expect(result[0].rewardAmount).to.equal(0n)
    })

    it('should handle single owner', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })

      const entries: RewardEntry[] = [{ tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_150 }]

      const result = instance.computeOwnerRewards(entries, VP_150)

      expect(result).to.have.lengthOf(1)
      expect(result[0].rewardAmount).to.equal(REWARD_TOTAL)
    })

    it('should handle empty entries', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })

      const result = instance.computeOwnerRewards([], VP_150)

      expect(result).to.have.lengthOf(0)
    })

    it('should handle cross-delegation (owner != voter)', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })

      const entries: RewardEntry[] = [
        { tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_60 },
        { tokenId: '2', owner: ALICE, voter: ALICE, votingPower: VP_40 },
        { tokenId: '3', owner: JORDAN, voter: ALICE, votingPower: VP_50 },
      ]

      const result = instance.computeOwnerRewards(entries, VP_150)

      expect(result).to.have.lengthOf(2)

      const alice = result.find(r => r.owner === ALICE)!
      expect(alice.votingPower).to.equal(VP_60 + VP_40)
      expect(alice.tokenIds).to.deep.equal(['1', '2'])

      const jordan = result.find(r => r.owner === JORDAN)!
      expect(jordan.votingPower).to.equal(VP_50)
      expect(jordan.tokenIds).to.deep.equal(['3'])
    })

    it('should redistribute dust to largest recipient', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: 10000n,
      })

      const entries: RewardEntry[] = [
        { tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_60 },
        { tokenId: '2', owner: BOB, voter: BOB, votingPower: VP_40 },
        { tokenId: '3', owner: JORDAN, voter: JORDAN, votingPower: VP_50 },
      ]

      const result = instance.computeOwnerRewards(entries, VP_150)
      const total = result.reduce((sum, r) => sum + r.rewardAmount, 0n)

      expect(total).to.equal(10000n)
    })

    it('should assign dust to the owner with largest votingPower', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: 10n,
      })

      const entries: RewardEntry[] = [
        { tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_60 },
        { tokenId: '2', owner: ALICE, voter: ALICE, votingPower: VP_40 },
        { tokenId: '3', owner: BOB, voter: BOB, votingPower: VP_50 },
      ]

      const result = instance.computeOwnerRewards(entries, VP_150)

      const alice = result.find(r => r.owner === ALICE)!
      const bob = result.find(r => r.owner === BOB)!

      expect(alice.rewardAmount).to.equal(7n)
      expect(bob.rewardAmount).to.equal(3n)
    })

    it('should assign dust to the later owner when it has the largest votingPower', () => {
      const instance = new VeRewardDistribution({
        epochId: 1,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: 10n,
      })

      const entries: RewardEntry[] = [
        { tokenId: '1', owner: BOB, voter: BOB, votingPower: VP_50 },
        { tokenId: '2', owner: ALICE, voter: ALICE, votingPower: VP_60 },
        { tokenId: '3', owner: ALICE, voter: ALICE, votingPower: VP_40 },
      ]

      const result = instance.computeOwnerRewards(entries, VP_150)

      const alice = result.find(r => r.owner === ALICE)!
      const bob = result.find(r => r.owner === BOB)!

      expect(alice.rewardAmount).to.equal(7n)
      expect(bob.rewardAmount).to.equal(3n)
    })
  })

  describe('init', () => {
    it('should return true and set fields on success', async () => {
      stubInitSuccess(sandbox)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.true
    })

    it('should return false if clock address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(null)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if escrow address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if lockNFT address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(null)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if adapter address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if voting period is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should resolve hookEnabled correctly', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 1000 })

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.init()

      expect(result).to.be.true
      expect(instance['hookEnabled']).to.be.true
    })
  })

  describe('parseGaugeLogsFromReceipt', () => {
    it('should return logs in natural receipt order', () => {
      const iFace = new Interface(GaugeVoter.abi)
      const log1 = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_60, 1700000000])
      const log2 = iFace.encodeEventLog('Voted', [BOB, ADAPTER, 5, VP_40, VP_60 + VP_40, VP_60 + VP_40, 1700000001])

      const receipt = {
        logs: [
          { address: PLUGIN, topics: log1.topics, data: log1.data },
          { address: PLUGIN, topics: log2.topics, data: log2.data },
        ],
      }

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = instance.parseGaugeLogsFromReceipt(receipt)

      expect(result).to.have.lengthOf(2)
      expect(result[0].parsed.args.votingPowerCastForGauge).to.equal(VP_60)
      expect(result[1].parsed.args.votingPowerCastForGauge).to.equal(VP_40)
    })

    it('should handle mixed Voted and Reset events', () => {
      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_60, 1700000000])
      const resetLog = iFace.encodeEventLog('Reset', [ALICE, ADAPTER, 5, VP_60, 0n, 0n, 1700000001])

      const receipt = {
        logs: [
          { address: PLUGIN, topics: votedLog.topics, data: votedLog.data },
          { address: PLUGIN, topics: resetLog.topics, data: resetLog.data },
        ],
      }

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = instance.parseGaugeLogsFromReceipt(receipt)

      expect(result).to.have.lengthOf(2)
      expect(result[0].parsed.name).to.equal('Voted')
      expect(result[1].parsed.name).to.equal('Reset')
    })
  })

  describe('resolveOnChainTotal', () => {
    it('should return null if receipt is null', async () => {
      stubInitSuccess(sandbox)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.be.null
    })

    it('should parse Voted event and extract totalVotingPowerInContract', async () => {
      stubInitSuccess(sandbox)

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_150, 1700000000])

      const receipt = {
        logs: [
          {
            address: PLUGIN,
            topics: votedLog.topics,
            data: votedLog.data,
          },
        ],
      }

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(receipt as any)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.equal(VP_150)
    })

    it('should parse Reset event and extract totalVotingPowerInContract', async () => {
      stubInitSuccess(sandbox)

      const iFace = new Interface(GaugeVoter.abi)
      const resetLog = iFace.encodeEventLog('Reset', [ALICE, ADAPTER, 5, VP_60, VP_40, VP_50, 1700000000])

      const receipt = {
        logs: [
          {
            address: PLUGIN,
            topics: resetLog.topics,
            data: resetLog.data,
          },
        ],
      }

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(receipt as any)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.equal(VP_50)
    })

    it('should ignore logs from non-plugin addresses', async () => {
      stubInitSuccess(sandbox)

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_150, 1700000000])

      const receipt = {
        logs: [
          {
            address: '0x0000000000000000000000000000000000000099',
            topics: votedLog.topics,
            data: votedLog.data,
          },
        ],
      }

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(receipt as any)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.equal(0n)
    })

    it('should return 0n if no matching events found', async () => {
      stubInitSuccess(sandbox)

      const receipt = {
        logs: [
          {
            address: PLUGIN,
            topics: ['0x0000000000000000000000000000000000000000000000000000000000000000'],
            data: '0x',
          },
        ],
      }

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(receipt as any)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.equal(0n)
    })

    it('should return totalVotingPowerInContract from the last log when multiple exist', async () => {
      stubInitSuccess(sandbox)

      const iFace = new Interface(GaugeVoter.abi)
      const log1 = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_60, 1700000000])
      const log2 = iFace.encodeEventLog('Voted', [BOB, ADAPTER, 5, VP_40, VP_60 + VP_40, VP_150, 1700000001])

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [
          { address: PLUGIN, topics: log1.topics, data: log1.data },
          { address: PLUGIN, topics: log2.topics, data: log2.data },
        ],
      } as any)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.equal(VP_150)
    })
  })

  describe('resolvePerGaugeOnChainTotals', () => {
    it('should resolve per-gauge VP from receipts sorted by blockNumber', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Models.VoteGauge, 'getLatestTxPerGauge').resolves([
        { gaugeAddress: ADAPTER, transactionHash: '0xtx1', blockNumber: 100 },
        { gaugeAddress: GAUGE_B, transactionHash: '0xtx2', blockNumber: 200 },
      ])

      const iFace = new Interface(GaugeVoter.abi)
      const log1 = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_60, 1700000000])
      const log2 = iFace.encodeEventLog('Voted', [BOB, GAUGE_B, 5, VP_50, VP_50, VP_60 + VP_50, 1700000001])

      const receiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
      receiptStub.withArgs('0xtx1', NETWORK).resolves({
        logs: [{ address: PLUGIN, topics: log1.topics, data: log1.data }],
      } as any)
      receiptStub.withArgs('0xtx2', NETWORK).resolves({
        logs: [{ address: PLUGIN, topics: log2.topics, data: log2.data }],
      } as any)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolvePerGaugeOnChainTotals()

      expect(result).to.not.be.null
      expect(result!.size).to.equal(2)
      expect(result!.get(ADAPTER)).to.equal(VP_60)
      expect(result!.get(GAUGE_B)).to.equal(VP_50)
    })

    it('should return null if any receipt fetch fails', async () => {
      stubInitSuccess(sandbox)

      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xtx1', blockNumber: 100 }])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolvePerGaugeOnChainTotals()

      expect(result).to.be.null
    })
  })

  describe('resolveRewardEntries', () => {
    it('should resolve delegation-based reward entries (non-hook)', async () => {
      stubInitSuccess(sandbox)

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_60 }])

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_60,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveRewardEntries(activeVoters)

      expect(result).to.have.lengthOf(1)
      expect(result[0].tokenId).to.equal('1')
      expect(result[0].owner).to.equal(ALICE)
      expect(result[0].voter).to.equal(ALICE)
      expect(result[0].votingPower).to.equal(VP_60)
    })

    it('should return empty when no delegations found', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Models.TokenDelegation, 'getActiveDelegations').resolves([])

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: 0n,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveRewardEntries(activeVoters)

      expect(result).to.have.lengthOf(0)
    })

    it('should handle cross-delegation scenario', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Models.TokenDelegation, 'getActiveDelegations').resolves([
        { delegator: ALICE, tokenId: '1', delegate: ALICE },
        { delegator: JORDAN, tokenId: '2', delegate: ALICE },
      ])

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([
        { tokenId: '1', votingPower: VP_60 },
        { tokenId: '2', votingPower: VP_50 },
      ])

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_60 + VP_50,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveRewardEntries(activeVoters)

      expect(result).to.have.lengthOf(2)
      expect(result[0].owner).to.equal(ALICE)
      expect(result[0].voter).to.equal(ALICE)
      expect(result[1].owner).to.equal(JORDAN)
      expect(result[1].voter).to.equal(ALICE)
    })

    it('should use per-voter timestamp when hookEnabled is true', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 1000 })

      sandbox.stub(Models.TokenDelegation, 'getDelegationSnapshots').resolves([
        {
          delegator: ALICE,
          tokenId: '1',
          snapshots: [{ action: 'delegate', blockNumber: 40, logIndex: 0, delegate: ALICE }],
          delegates: [ALICE],
        },
      ])

      const batchStub = sandbox
        .stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch')
        .resolves([{ tokenId: '1', votingPower: VP_60 }])

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_60,
          latestTxHash: '0xabc',
          latestBlock: 50,
          latestLogIndex: 0,
          latestBlockTimestamp: 1500,
        },
      ]

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveRewardEntries(activeVoters)

      expect(result).to.have.lengthOf(1)
      expect(batchStub.args[0][0][0].ts).to.equal(1500)
    })

    it('should return no entries for a voter with no delegation snapshots (hook path)', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 1000 })

      sandbox.stub(Models.TokenDelegation, 'getDelegationSnapshots').resolves([
        {
          delegator: ALICE,
          tokenId: '1',
          snapshots: [{ action: 'delegate', blockNumber: 40, logIndex: 0, delegate: ALICE }],
          delegates: [ALICE],
        },
      ])

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_60 }])

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_60,
          latestTxHash: '0xabc',
          latestBlock: 50,
          latestLogIndex: 0,
          latestBlockTimestamp: 1500,
        },
        {
          voter: BOB,
          usedVP: VP_50,
          latestTxHash: '0xdef',
          latestBlock: 50,
          latestLogIndex: 0,
          latestBlockTimestamp: 1500,
        },
      ]

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      const result = await instance.resolveRewardEntries(activeVoters)

      expect(result).to.have.lengthOf(1)
      expect(result[0].voter).to.equal(ALICE)
    })

    it('should use epochStart timestamp for non-hook path', async () => {
      stubInitSuccess(sandbox)

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])

      const batchStub = sandbox
        .stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch')
        .resolves([{ tokenId: '1', votingPower: VP_60 }])

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_60,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1500,
        },
      ]

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()
      await instance.resolveRewardEntries(activeVoters)

      expect(batchStub.args[0][0][0].ts).to.equal(1000)
    })
  })

  describe('validateEpochWindow', () => {
    it('should return null when within the valid window', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox
        .stub(GaugeHelper, 'getVotingPeriodEnd')
        .resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 14000 })

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()

      // Set time to voteEnd + 300 + 10 = 2310
      sandbox.stub(Date, 'now').returns(2310 * 1000)

      const result = instance.validateEpochWindow()
      expect(result).to.be.null
    })

    it('should return error when voting window has not closed', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox
        .stub(GaugeHelper, 'getVotingPeriodEnd')
        .resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 14000 })

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()

      // Set time before voteEnd + SNAPSHOT_BUFFER
      sandbox.stub(Date, 'now').returns(2100 * 1000)

      const result = instance.validateEpochWindow()
      expect(result).to.include('voting window has not closed')
    })

    it('should return error when reward generation window has passed', async () => {
      sandbox.stub(config, 'ALLOW_RETROACTIVE_REWARDS').value(false)
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox
        .stub(GaugeHelper, 'getVotingPeriodEnd')
        .resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 14000 })

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()

      // Set time past nextEpochStart (1000 + 14000 = 15000)
      sandbox.stub(Date, 'now').returns(15001 * 1000)

      const result = instance.validateEpochWindow()
      expect(result).to.include('reward generation window has passed')
    })

    it('should allow retroactive rewards when ALLOW_RETROACTIVE_REWARDS is true and epoch has passed', async () => {
      sandbox.stub(config, 'ALLOW_RETROACTIVE_REWARDS').value(true)
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox
        .stub(GaugeHelper, 'getVotingPeriodEnd')
        .resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 14000 })

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()

      // Set time well past nextEpochStart (1000 + 14000 = 15000)
      sandbox.stub(Date, 'now').returns(50000 * 1000)

      const result = instance.validateEpochWindow()
      expect(result).to.be.null
    })

    it('should still enforce lower bound when ALLOW_RETROACTIVE_REWARDS is true', async () => {
      sandbox.stub(config, 'ALLOW_RETROACTIVE_REWARDS').value(true)
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox
        .stub(GaugeHelper, 'getVotingPeriodEnd')
        .resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 14000 })

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      await instance.init()

      // Set time before voteEnd + SNAPSHOT_BUFFER
      sandbox.stub(Date, 'now').returns(2100 * 1000)

      const result = instance.validateEpochWindow()
      expect(result).to.include('voting window has not closed')
    })
  })

  describe('compute', () => {
    it('should return null if init fails', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(null)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      expect(result).to.be.null
    })

    it('should return error if no active voters', async () => {
      stubInitSuccess(sandbox)
      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves([])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      expect(result).to.have.property('error', 'No Active Voters')
    })

    it('should return error if no VoteGauge events found', async () => {
      stubInitSuccess(sandbox)
      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves([
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ])
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      expect(result).to.have.property('error', 'No VoteGauge events found')
    })

    it('should return error if on-chain total cannot be resolved', async () => {
      stubInitSuccess(sandbox)
      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves([
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ])
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      expect(result).to.have.property('error', 'Failed to resolve on-chain total voting power')
    })

    it('should return full result with invariants on success', async () => {
      stubInitSuccess(sandbox)

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_150, VP_150, VP_150, 1700000000])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_150)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)
      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xabc', blockNumber: 100 }])

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      expect(result.epoch).to.equal(5)
      expect(result.pluginAddress).to.equal(PLUGIN)
      expect(result.network).to.equal(NETWORK)
      expect(result.contractTotal).to.equal(VP_150)
      expect(result.hookEnabled).to.be.false
      expect(result.writeEpochId).to.equal(5)
      expect(result.invariants).to.have.lengthOf(5)
      expect(result.ownerRewards).to.have.lengthOf(1)
      expect(result.ownerRewards[0].owner).to.equal(ALICE)
      expect(result.ownerRewards[0].rewardAmount).to.equal(REWARD_TOTAL)
    })

    it('should set writeEpochId to 0 when hookEnabled is true', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 1000 })
      sandbox.stub(VeRewardDistribution.prototype, 'validateEpochWindow').returns(null)

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_150, VP_150, VP_150, 1700000000])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_150)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)
      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xabc', blockNumber: 100 }])

      sandbox.stub(Models.TokenDelegation, 'getDelegationSnapshots').resolves([
        {
          delegator: ALICE,
          tokenId: '1',
          snapshots: [{ action: 'delegate', blockNumber: 90, logIndex: 0, delegate: ALICE }],
          delegates: [ALICE],
        },
      ])

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      expect(result.writeEpochId).to.equal(0)
      expect(result.hookEnabled).to.be.true
    })

    it('should fail inv1b when onChainGaugeTotals is null', async () => {
      stubInitSuccess(sandbox)

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_150, VP_150, VP_150, 1700000000])

      const receiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
      // First call: resolveOnChainTotal succeeds
      receiptStub.onFirstCall().resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)
      // Second call: resolvePerGaugeOnChainTotals -> receipt is null -> returns null
      receiptStub.onSecondCall().resolves(null)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_150)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)
      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xtx_gauge', blockNumber: 100 }])

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])
      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      const inv1b = result.invariants.find(i => i.name === '1b')!
      expect(inv1b.pass).to.be.false
      expect(inv1b.failures).to.deep.equal(['failed to fetch per-gauge on-chain totals'])
    })

    it('should fail inv1b when a gauge is missing from on-chain totals', async () => {
      stubInitSuccess(sandbox)

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_150, VP_150, VP_150, 1700000000])

      // resolveOnChainTotal receipt
      const receiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
      receiptStub.withArgs('0xabc', NETWORK).resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      // perGaugeVP has ADAPTER + GAUGE_B, but on-chain only has ADAPTER
      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_60)
      gaugeMap.set(GAUGE_B, VP_50)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)

      // resolvePerGaugeOnChainTotals: only ADAPTER tx, no GAUGE_B tx
      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xtx_adapter', blockNumber: 100 }])

      const adapterLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_150, 1700000000])
      receiptStub.withArgs('0xtx_adapter', NETWORK).resolves({
        logs: [{ address: PLUGIN, topics: adapterLog.topics, data: adapterLog.data }],
      } as any)

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])
      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      const inv1b = result.invariants.find(i => i.name === '1b')!
      expect(inv1b.pass).to.be.false
      expect(inv1b.failures!.some(f => f.includes(GAUGE_B) && f.includes('missing'))).to.be.true
    })

    it('should fail inv1b when indexed VP differs from on-chain VP for a gauge', async () => {
      stubInitSuccess(sandbox)

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_150, VP_150, VP_150, 1700000000])

      const receiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
      receiptStub.withArgs('0xabc', NETWORK).resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      // perGaugeVP says ADAPTER=VP_60, but on-chain will say ADAPTER=VP_40 (mismatch)
      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_60)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)

      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xtx_adapter', blockNumber: 100 }])

      // On-chain says VP_40 for ADAPTER gauge (differs from indexed VP_60)
      const adapterLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_40, VP_40, VP_150, 1700000000])
      receiptStub.withArgs('0xtx_adapter', NETWORK).resolves({
        logs: [{ address: PLUGIN, topics: adapterLog.topics, data: adapterLog.data }],
      } as any)

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])
      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      const inv1b = result.invariants.find(i => i.name === '1b')!
      expect(inv1b.pass).to.be.false
      expect(inv1b.failures!.some(f => f.includes(ADAPTER) && f.includes('indexed='))).to.be.true
    })

    it('should fail inv2b when a tokenId appears for multiple voters', async () => {
      stubInitSuccess(sandbox)

      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_60,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
        {
          voter: BOB,
          usedVP: VP_40,
          latestTxHash: '0xdef',
          latestBlock: 101,
          latestLogIndex: 0,
          latestBlockTimestamp: 1001,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xdef' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [BOB, ADAPTER, 5, VP_40, VP_60 + VP_40, VP_60 + VP_40, 1700000001])

      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_60 + VP_40)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)

      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xdef', blockNumber: 101 }])

      // Both ALICE and BOB delegated with the same tokenId '1' — double-counted
      sandbox.stub(Models.TokenDelegation, 'getActiveDelegations').resolves([
        { delegator: ALICE, tokenId: '1', delegate: ALICE },
        { delegator: JORDAN, tokenId: '1', delegate: BOB },
      ])

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([
        { tokenId: '1', votingPower: VP_60 },
        { tokenId: '1', votingPower: VP_40 },
      ])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      const inv2b = result.invariants.find(i => i.name === '2b')!
      expect(inv2b.pass).to.be.false
      expect(inv2b.failures).to.have.lengthOf(1)
      expect(inv2b.failures![0]).to.include('token=1')
    })

    it('should return { error } when epoch window is invalid', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
      sandbox
        .stub(GaugeHelper, 'getVotingPeriodEnd')
        .resolves({ epochStart: 1000, voteEnd: 2000, epochDuration: 14000 })

      // Set time before snapshot buffer closes
      sandbox.stub(Date, 'now').returns(2100 * 1000)

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      expect(result).to.not.be.null
      expect(result).to.have.property('error')
      expect((result as { error: string }).error).to.include('voting window has not closed')
    })

    it('should fail inv2a when voter VP sum differs from usedVP beyond tolerance', async () => {
      stubInitSuccess(sandbox)

      // Large mismatch: usedVP=VP_150 but token VP will resolve to VP_60
      const activeVoters: ActiveVoter[] = [
        {
          voter: ALICE,
          usedVP: VP_150,
          latestTxHash: '0xabc',
          latestBlock: 100,
          latestLogIndex: 0,
          latestBlockTimestamp: 1000,
        },
      ]

      sandbox.stub(Models.VoteGauge, 'getActiveVoters').resolves(activeVoters)
      sandbox.stub(Models.VoteGauge, 'getMostRecentVoteEvent').resolves({ transactionHash: '0xabc' })

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_150, VP_150, VP_150, 1700000000])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_150)
      sandbox.stub(Models.VoteGauge, 'getPerGaugeVP').resolves(gaugeMap)

      sandbox
        .stub(Models.VoteGauge, 'getLatestTxPerGauge')
        .resolves([{ gaugeAddress: ADAPTER, transactionHash: '0xabc', blockNumber: 100 }])

      sandbox
        .stub(Models.TokenDelegation, 'getActiveDelegations')
        .resolves([{ delegator: ALICE, tokenId: '1', delegate: ALICE }])

      // Token VP is VP_60 but usedVP is VP_150 -> diff = VP_150 - VP_60 = 90e18 >> tolerance (1 gauge = 1n)
      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_60 }])

      const instance = new VeRewardDistribution({
        epochId: 5,
        pluginAddress: PLUGIN,
        network: NETWORK,
        rewardTotalAmount: REWARD_TOTAL,
      })
      const result = await instance.compute()

      assertSuccess(result)
      const inv2a = result.invariants.find(i => i.name === '2a')!
      expect(inv2a.pass).to.be.false
      expect(inv2a.failures).to.have.lengthOf(1)
      expect(inv2a.failures![0]).to.include(ALICE)
      expect(inv2a.failures![0]).to.include('diff=')
    })
  })
})
