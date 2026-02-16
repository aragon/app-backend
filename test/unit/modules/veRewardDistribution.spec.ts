import { GaugeVoter } from '@artifacts/GaugeVoter'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { GaugeGovernance } from '@governance/gaugeGovernance'
import ProxyWeb3Provider from '@modules/proxyProvider'
import VeRewardDistribution from '@modules/veRewardDistribution'
import {
  type ActiveVoter,
  type IFormattedLog,
  type RewardEntry,
  IVotingEscrowAdapterLogs,
  NetworksEnum,
  TokenTransfer,
} from '@types'
import { expect } from 'chai'
import { Interface, ZeroAddress } from 'ethers'
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

function makeFormattedLog(
  eventName: string,
  args: Record<string, any>,
  blockNumber: number,
  logIndex = 0,
): IFormattedLog {
  return {
    event: { name: eventName, args } as any,
    info: {
      network: NETWORK,
      blockNumber,
      transactionIndex: 0,
      logIndex,
      transactionHash: '0xabc' as any,
      address: ADAPTER,
      eventName,
    },
    handler: null,
  } as IFormattedLog
}

function stubInitSuccess(sandbox: SinonSandbox) {
  sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
  sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
  sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
  sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
  sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(false)
  sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000 })
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
    it('should group entries by owner and compute shareBps', () => {
      const instance = new VeRewardDistribution({ epochId: 1, pluginAddress: PLUGIN, network: NETWORK })

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
      expect(alice.shareBps).to.equal(((VP_60 + VP_40) * 10000n) / VP_150)

      const bob = result.find(r => r.owner === BOB)!
      expect(bob.tokenIds).to.deep.equal(['3'])
      expect(bob.votingPower).to.equal(VP_50)
      expect(bob.shareBps).to.equal((VP_50 * 10000n) / VP_150)
    })

    it('should return 0n shareBps when onChainTotal is 0n', () => {
      const instance = new VeRewardDistribution({ epochId: 1, pluginAddress: PLUGIN, network: NETWORK })

      const entries: RewardEntry[] = [{ tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_60 }]

      const result = instance.computeOwnerRewards(entries, 0n)

      expect(result[0].shareBps).to.equal(0n)
    })

    it('should handle single owner', () => {
      const instance = new VeRewardDistribution({ epochId: 1, pluginAddress: PLUGIN, network: NETWORK })

      const entries: RewardEntry[] = [{ tokenId: '1', owner: ALICE, voter: ALICE, votingPower: VP_150 }]

      const result = instance.computeOwnerRewards(entries, VP_150)

      expect(result).to.have.lengthOf(1)
      expect(result[0].shareBps).to.equal(10000n)
    })

    it('should handle empty entries', () => {
      const instance = new VeRewardDistribution({ epochId: 1, pluginAddress: PLUGIN, network: NETWORK })

      const result = instance.computeOwnerRewards([], VP_150)

      expect(result).to.have.lengthOf(0)
    })

    it('should handle cross-delegation (owner != voter)', () => {
      const instance = new VeRewardDistribution({ epochId: 1, pluginAddress: PLUGIN, network: NETWORK })

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
  })

  describe('init', () => {
    it('should return true and set fields on success', async () => {
      stubInitSuccess(sandbox)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.init()

      expect(result).to.be.true
    })

    it('should return false if clock address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(null)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if escrow address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if lockNFT address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(null)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should return false if adapter address is null', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(null)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
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

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.init()

      expect(result).to.be.false
    })

    it('should resolve hookEnabled correctly', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000 })

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.init()

      expect(result).to.be.true
      expect(instance['hookEnabled']).to.be.true
    })
  })

  describe('getActiveVoters', () => {
    it('should delegate to GaugeGovernance.getActiveVoters', async () => {
      stubInitSuccess(sandbox)

      const mockVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: VP_60, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      const stub = sandbox.stub(GaugeGovernance, 'getActiveVoters').resolves(mockVoters)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.getActiveVoters()

      expect(stub.calledOnceWith(PLUGIN, NETWORK, 2000)).to.be.true
      expect(result).to.deep.equal(mockVoters)
    })
  })

  describe('resolveOnChainTotal', () => {
    it('should return null if receipt is null', async () => {
      stubInitSuccess(sandbox)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
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

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
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

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
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

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
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

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveOnChainTotal('0xtxhash')

      expect(result).to.equal(0n)
    })
  })

  describe('crawlDelegationLogs', () => {
    it('should fetch deploy blocks, crawl events, and return sorted merged logs', async () => {
      stubInitSuccess(sandbox)

      const fetchStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation')
      fetchStub.onFirstCall().resolves({ blockNumber: 10 } as any)
      fetchStub.onSecondCall().resolves({ blockNumber: 20 } as any)

      const delegationLogs: IFormattedLog[] = [makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, {}, 50)]
      const transferLogs: IFormattedLog[] = [makeFormattedLog(TokenTransfer.Transfer, {}, 40)]

      const crawlStub = sandbox.stub(Web3Helper, 'crawlEvents')
      crawlStub.onFirstCall().resolves(delegationLogs)
      crawlStub.onSecondCall().resolves(transferLogs)

      const sorted = [transferLogs[0], delegationLogs[0]]
      sandbox.stub(Web3Helper, 'sortLogs').returns(sorted)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.crawlDelegationLogs(100)

      expect(result).to.deep.equal(sorted)
      expect(fetchStub.calledTwice).to.be.true
      expect(crawlStub.calledTwice).to.be.true
    })
  })

  describe('resolveRewardEntries', () => {
    it('should process Transfer and TokensDelegated events into reward entries', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Web3Helper, 'findBlockAtTimestamp').resolves(100)

      const sortedLogs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
      ]

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: VP_60, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_60 }])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveRewardEntries(sortedLogs, activeVoters)

      expect(result).to.have.lengthOf(1)
      expect(result[0].tokenId).to.equal('1')
      expect(result[0].owner).to.equal(ALICE)
      expect(result[0].voter).to.equal(ALICE)
      expect(result[0].votingPower).to.equal(VP_60)
    })

    it('should handle TokensUndelegated by removing delegation', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Web3Helper, 'findBlockAtTimestamp').resolves(100)

      const sortedLogs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensUndelegated, { tokenIds: [1n] }, 12),
      ]

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: 0n, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveRewardEntries(sortedLogs, activeVoters)

      expect(result).to.have.lengthOf(0)
    })

    it('should handle burn (transfer to zero address)', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Web3Helper, 'findBlockAtTimestamp').resolves(100)

      const sortedLogs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
        makeFormattedLog(TokenTransfer.Transfer, { from: ALICE, to: ZeroAddress, tokenId: 1n }, 12),
      ]

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: 0n, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveRewardEntries(sortedLogs, activeVoters)

      expect(result).to.have.lengthOf(0)
    })

    it('should handle cross-delegation scenario', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Web3Helper, 'findBlockAtTimestamp').resolves(100)

      const sortedLogs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: JORDAN, tokenId: 2n }, 10, 1),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [2n], delegatee: ALICE }, 12),
      ]

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: VP_60 + VP_50, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([
        { tokenId: '1', votingPower: VP_60 },
        { tokenId: '2', votingPower: VP_50 },
      ])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveRewardEntries(sortedLogs, activeVoters)

      expect(result).to.have.lengthOf(2)
      expect(result[0].owner).to.equal(ALICE)
      expect(result[0].voter).to.equal(ALICE)
      expect(result[1].owner).to.equal(JORDAN)
      expect(result[1].voter).to.equal(ALICE)
    })

    it('should clear delegation on transfer to new owner', async () => {
      stubInitSuccess(sandbox)

      sandbox.stub(Web3Helper, 'findBlockAtTimestamp').resolves(100)

      const sortedLogs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
        makeFormattedLog(TokenTransfer.Transfer, { from: ALICE, to: BOB, tokenId: 1n }, 12),
      ]

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: 0n, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveRewardEntries(sortedLogs, activeVoters)

      expect(result).to.have.lengthOf(0)
    })

    it('should use per-voter checkpoint blocks when hookEnabled is true', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000 })

      const sortedLogs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
      ]

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: VP_60, latestTxHash: '0xabc', latestBlock: 50, latestBlockTimestamp: 1500 },
      ]

      const batchStub = sandbox
        .stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch')
        .resolves([{ tokenId: '1', votingPower: VP_60 }])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      await instance.init()
      const result = await instance.resolveRewardEntries(sortedLogs, activeVoters)

      expect(result).to.have.lengthOf(1)
      expect(batchStub.args[0][0][0].ts).to.equal(1500)
    })
  })

  describe('compute', () => {
    it('should return null if init fails', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(null)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.compute()

      expect(result).to.be.null
    })

    it('should return null if no active voters', async () => {
      stubInitSuccess(sandbox)
      sandbox.stub(GaugeGovernance, 'getActiveVoters').resolves([])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.compute()

      expect(result).to.be.null
    })

    it('should return null if on-chain total cannot be resolved', async () => {
      stubInitSuccess(sandbox)
      sandbox
        .stub(GaugeGovernance, 'getActiveVoters')
        .resolves([
          { voter: ALICE, usedVP: VP_150, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
        ])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.compute()

      expect(result).to.be.null
    })

    it('should return full result with invariants on success', async () => {
      stubInitSuccess(sandbox)

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: VP_150, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(GaugeGovernance, 'getActiveVoters').resolves(activeVoters)

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_150, 1700000000])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_150)
      sandbox.stub(GaugeGovernance, 'getPerGaugeVP').resolves(gaugeMap)

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({ blockNumber: 1 } as any)

      const logs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
      ]
      sandbox.stub(Web3Helper, 'crawlEvents').resolves(logs)
      sandbox.stub(Web3Helper, 'sortLogs').returns(logs)
      sandbox.stub(Web3Helper, 'findBlockAtTimestamp').resolves(100)
      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.compute()

      expect(result).to.not.be.null
      expect(result!.epoch).to.equal(5)
      expect(result!.pluginAddress).to.equal(PLUGIN)
      expect(result!.network).to.equal(NETWORK)
      expect(result!.contractTotal).to.equal(VP_150)
      expect(result!.hookEnabled).to.be.false
      expect(result!.writeEpochId).to.equal(5)
      expect(result!.invariants).to.have.lengthOf(5)
      expect(result!.ownerRewards).to.have.lengthOf(1)
      expect(result!.ownerRewards[0].owner).to.equal(ALICE)
      expect(result!.ownerRewards[0].shareBps).to.equal(10000n)
    })

    it('should set writeEpochId to 0 when hookEnabled is true', async () => {
      sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(CLOCK)
      sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(ESCROW)
      sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(LOCK_NFT)
      sandbox.stub(GaugeHelper, 'getIVotesAdapterAddress').resolves(ADAPTER)
      sandbox.stub(GaugeHelper, 'getEnableUpdateVotingPowerHookFlag').resolves(true)
      sandbox.stub(GaugeHelper, 'getVotingPeriodEnd').resolves({ epochStart: 1000, voteEnd: 2000 })

      const activeVoters: ActiveVoter[] = [
        { voter: ALICE, usedVP: VP_150, latestTxHash: '0xabc', latestBlock: 100, latestBlockTimestamp: 1000 },
      ]

      sandbox.stub(GaugeGovernance, 'getActiveVoters').resolves(activeVoters)

      const iFace = new Interface(GaugeVoter.abi)
      const votedLog = iFace.encodeEventLog('Voted', [ALICE, ADAPTER, 5, VP_60, VP_60, VP_150, 1700000000])
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [{ address: PLUGIN, topics: votedLog.topics, data: votedLog.data }],
      } as any)

      const gaugeMap = new Map<string, bigint>()
      gaugeMap.set(ADAPTER, VP_150)
      sandbox.stub(GaugeGovernance, 'getPerGaugeVP').resolves(gaugeMap)

      sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({ blockNumber: 1 } as any)

      const logs: IFormattedLog[] = [
        makeFormattedLog(TokenTransfer.Transfer, { from: ZeroAddress, to: ALICE, tokenId: 1n }, 10),
        makeFormattedLog(IVotingEscrowAdapterLogs.TokensDelegated, { tokenIds: [1n], delegatee: ALICE }, 11),
      ]
      sandbox.stub(Web3Helper, 'crawlEvents').resolves(logs)
      sandbox.stub(Web3Helper, 'sortLogs').returns(logs)
      sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves([{ tokenId: '1', votingPower: VP_150 }])

      const instance = new VeRewardDistribution({ epochId: 5, pluginAddress: PLUGIN, network: NETWORK })
      const result = await instance.compute()

      expect(result).to.not.be.null
      expect(result!.writeEpochId).to.equal(0)
      expect(result!.hookEnabled).to.be.true
    })
  })
})
