import { Models } from '@dbModels'
import GovernanceRewards from '@modules/governanceRewards'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers } from 'ethers'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import {
  type GaugesActivityResult,
  type ResolvedProposal,
  VoteOption,
  runGaugesActivity,
} from '../setups/gaugesActivity'
import { type GaugesDaoDeployment, setupGaugesDao } from '../setups/gaugesDaoSetup'
import { computeExpectedRewards } from '../setups/rewardsExpectation'

const NETWORK = NetworksEnum.ethereumMainnet
const FORK_BLOCK = 24541643

describe.only('Governance Rewards — GaugeVoter synthetic fixture', function () {
  this.timeout(600_000)
  this.slow(0)

  let dep: GaugesDaoDeployment
  let activity: GaugesActivityResult
  let stakerCount: number

  before(async () => {
    await resetFork(FORK_BLOCK)
    const startBlock = await getAnvilProvider().getBlockNumber()

    dep = await setupGaugesDao()

    activity = await runGaugesActivity(dep, {
      stakers: [
        { amount: ethers.parseEther('1000') },
        { amount: ethers.parseEther('2000') },
        { amount: ethers.parseEther('3000') },
        { amount: ethers.parseEther('4000') },
        { amount: ethers.parseEther('5000') },
      ],
      // staker0 → self, staker1 → self, staker2 → staker0, staker3 → staker0, staker4 → staker1.
      // Two delegate "pools": staker0 receives 3 NFTs (incl. self), staker1 receives 2 (incl. self).
      delegations: [
        { from: 0, to: 'self' },
        { from: 1, to: 'self' },
        { from: 2, to: 0 },
        { from: 3, to: 0 },
        { from: 4, to: 1 },
      ],
      // Two proposals on TokenVoting. Only delegates have non-zero VP at snapshot,
      // so only staker0 and staker1 can vote.
      // Proposal 1: both delegates vote (Yes/No).
      // Proposal 2: only staker0 votes (Yes). staker1's delegators get nothing for this one.
      proposals: [
        {
          votes: [
            { from: 0, choice: VoteOption.Yes },
            { from: 1, choice: VoteOption.No },
          ],
        },
        {
          votes: [{ from: 0, choice: VoteOption.Yes }],
        },
      ],
    })
    stakerCount = activity.stakers.length

    const latestBlock = await getAnvilProvider().getBlockNumber()
    await startServices(startBlock)
    await waitForIndexerCatchup(latestBlock, 180_000)
  })

  after(() => stopServices())

  it('indexes one Lock per staker', async () => {
    const escrowLocks = await Models.Lock.find({ network: NETWORK, escrowAddress: dep.votingEscrow })
    expect(escrowLocks.length, `expected ${stakerCount} locks under escrow ${dep.votingEscrow}`).to.equal(stakerCount)
  })

  it('indexes the gauge voter and token voting plugins', async () => {
    const plugins = await Models.Plugin.find({ network: NETWORK, daoAddress: dep.dao })
    const addresses = plugins.map(p => p.address)
    expect(addresses).to.include(dep.gaugeVoter)
    expect(addresses).to.include(dep.tokenVoting)
  })

  it('indexes the DAO', async () => {
    const dao = await Models.Dao.findOne({ network: NETWORK, address: dep.dao })
    expect(dao, `DAO ${dep.dao} not found`).to.exist
  })

  it('indexes one TokenDelegation per delegate call', async () => {
    const records = await Models.TokenDelegation.find({ network: NETWORK, contractAddress: dep.adapter })
    expect(records.length, `expected ${activity.delegations.length} delegation records on adapter`).to.equal(
      activity.delegations.length,
    )
  })

  it('active delegations match the configured mapping', async () => {
    // BE-160 calc reads TokenDelegation.getActiveDelegations(contract, network, delegateAddrs, ts).
    // The delegateAddrs filter is the set of "interesting" delegates — pass every unique target.
    const uniqueDelegates = Array.from(new Set(activity.delegations.map(d => d.to)))
    const nowSec = Math.floor(Date.now() / 1000)
    const active = await Models.TokenDelegation.getActiveDelegations(dep.adapter, NETWORK, uniqueDelegates, nowSec)

    // Expect one active entry per staker (one tokenId per lock, all currently delegated).
    expect(active.length, 'one active delegation per staker').to.equal(activity.stakers.length)

    // Build expected map: delegator -> delegate
    const expected = new Map<string, string>()
    for (const d of activity.delegations) expected.set(d.from, d.to)

    for (const entry of active) {
      const expectedDelegate = expected.get(entry.delegator)
      expect(expectedDelegate, `unexpected delegator ${entry.delegator}`).to.exist
      expect(entry.delegate).to.equal(expectedDelegate)
    }
  })

  it('indexes one Proposal per createProposal call', async () => {
    const proposals = await Models.Proposal.find({ network: NETWORK, pluginAddress: dep.tokenVoting })
    expect(proposals.length, `expected ${activity.proposals.length} proposals on TokenVoting`).to.equal(
      activity.proposals.length,
    )
  })

  it('indexes one Vote per cast vote', async () => {
    const expectedVotes = activity.proposals.reduce((n: number, p: ResolvedProposal) => n + p.votes.length, 0)
    const votes = await Models.Vote.find({ network: NETWORK, pluginAddress: dep.tokenVoting })
    expect(votes.length, `expected ${expectedVotes} votes on TokenVoting`).to.equal(expectedVotes)
  })

  it('reward calculation matches expected exactly', async () => {
    // Wide window — fork timestamps are in 2026, wall clock is also 2026.
    // Picking 2024-01-01 guarantees windowStart < every proposal.endDate.
    const totalAmount = ethers.parseEther('1000')
    const lookbackDate = '2024-01-01T00:00:00.000Z'

    const calc = new GovernanceRewards({
      pluginAddress: dep.tokenVoting as HexAddress,
      network: NETWORK,
      totalAmount,
      lookbackDate,
    })
    const actual = await calc.compute()
    if ('error' in actual) throw new Error(`GovernanceRewards.compute returned error: ${actual.error}`)

    const expected = await computeExpectedRewards({
      dep,
      activity,
      network: NETWORK,
      totalAmount,
      lookbackDate,
    })

    console.log('actual rewards:', actual)
    console.log('expected rewards:', expected)

    // Sanity: total payout must equal totalAmount (no value lost in pro-rata + dust).
    const actualSum = actual.reduce((s, r) => s + r.amount, 0n)
    expect(actualSum, 'actual sum != totalAmount').to.equal(totalAmount)

    // Exact match: every recipient, every amount, in the same order.
    expect(actual.length, 'recipient count mismatch').to.equal(expected.length)
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].address, `address mismatch at index ${i}`).to.equal(expected[i].address)
      expect(actual[i].amount, `amount mismatch at index ${i} (${actual[i].address})`).to.equal(expected[i].amount)
    }
  })
})
