import { Models } from '@dbModels'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { runErc20DelegationActivity } from '../setups/erc20DelegationActivity'
import { setupTokenVotingDao } from '../setups/tokenVotingDaoSetup'
import type { Erc20DelegationActivityResult, TokenVotingDaoDeployment } from '../types/tokenVotingFixture'
import MemberController from '@api/controllers/member'

const NETWORK = NetworksEnum.ethereumMainnet
const FORK_BLOCK = 24541643 // same as governanceRewards.spec.ts

describe('TokenVoting Delegators API — anvil ERC20 fixture', function () {
  this.timeout(600_000)
  this.slow(0)

  let dep: TokenVotingDaoDeployment
  let activity: Erc20DelegationActivityResult

  before(async () => {
    await resetFork(FORK_BLOCK)
    const startBlock = await getAnvilProvider().getBlockNumber()

    dep = await setupTokenVotingDao()

    activity = await runErc20DelegationActivity(dep, {
      holders: [
        { amount: 100_000n * 10n ** 18n }, // holder0
        { amount: 50_000n * 10n ** 18n }, // holder1
        { amount: 25_000n * 10n ** 18n }, // holder2
        { amount: 80_000n * 10n ** 18n }, // holder3
        { amount: 30_000n * 10n ** 18n }, // holder4
        { amount: 60_000n * 10n ** 18n }, // holder5
      ],
      delegations: [
        { fromHolder: 0, to: 'memberA' },
        { fromHolder: 1, to: 'memberA' },
        { fromHolder: 2, to: 'memberB' },
        { fromHolder: 3, to: 'memberA' },
        { fromHolder: 4, to: 'memberA' },
        { fromHolder: 5, to: 'memberB' },
        { fromHolder: 0, to: 'memberC' },
      ],
    })

    const latestBlock = await getAnvilProvider().getBlockNumber()
    await startServices(startBlock)
    await waitForIndexerCatchup(latestBlock, 180_000)

    const targets = [activity.members.memberA, activity.members.memberB, activity.members.memberC]
    const start = Date.now()
    let found = 0
    while (Date.now() - start < 30_000) {
      found = await Models.TokenMember.countDocuments({
        network: NETWORK,
        tokenAddress: dep.token,
        memberAddress: { $in: targets },
      })
      if (found === targets.length) break
      await new Promise(r => setTimeout(r, 200))
    }
    if (found !== targets.length) {
      throw new Error(`TokenMember rows not persisted within 30s: expected ${targets.length}, found ${found}`)
    }
  })

  after(() => stopServices())

  it('indexes the Plugin row with the deployed token address', async () => {
    const plugin = await Models.Plugin.findOne({ network: NETWORK, address: dep.tokenVoting })
    expect(plugin, `Plugin ${dep.tokenVoting} not found`).to.exist
    expect(plugin!.tokenAddress).to.equal(dep.token)
  })

  it('indexes one LogDelegateChanged per delegate() call (incl. deployer self-delegate)', async () => {
    const logs = await Models.LogDelegateChanged.find({
      network: NETWORK,
      tokenAddress: dep.token,
    })
    expect(logs.length, `expected ${activity.delegations.length + 1} delegate-changed logs`).to.equal(
      activity.delegations.length + 1,
    )
  })

  it('findDelegatorsForMember(memberA): all 3 active delegators present after holder0 re-delegated away', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberA as HexAddress,
      { sort: 'votingPower', order: 'desc' },
    )

    expect(result.data, 'memberA should have 3 delegators after holder0 re-delegated to memberC').to.have.lengthOf(3)

    const addrs = result.data.map(d => d.address)
    expect(addrs).to.include.members([
      activity.holders[1].address,
      activity.holders[3].address,
      activity.holders[4].address,
    ])
    expect(addrs).to.not.include(activity.holders[0].address) // re-delegated away
    for (const row of result.data) expect(row.votingPower).to.equal('0')

    // Per-row tx/block/timestamp must match the matching delegation in activity for each holder.
    for (const row of result.data) {
      const matching = activity.delegations.find(d => d.from === row.address && d.to === activity.members.memberA)
      expect(matching, `expected delegation row in activity for ${row.address}`).to.exist
      expect(row.transactionHash).to.equal(matching!.transactionHash)
      expect(row.blockNumber).to.equal(matching!.blockNumber)
      expect(row.blockTimestamp).to.equal(matching!.blockTimestamp)
    }
  })

  it('findDelegatorsForMember(memberC): holder0 with re-delegation event metadata', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberC as HexAddress,
      { sort: 'votingPower', order: 'desc' },
    )

    expect(result.data, 'memberC should have exactly 1 delegator (holder0 after re-delegation)').to.have.lengthOf(1)
    expect(result.data[0].address).to.equal(activity.holders[0].address)
    expect(result.data[0].votingPower).to.equal('0')

    const reDelegation = activity.delegations.find(
      d => d.from === activity.holders[0].address && d.to === activity.members.memberC,
    )
    expect(reDelegation, 'expected matching holder0 -> memberC re-delegation in activity').to.exist
    expect(result.data[0].transactionHash).to.equal(reDelegation!.transactionHash)
    expect(result.data[0].blockNumber).to.equal(reDelegation!.blockNumber)
    expect(result.data[0].blockTimestamp).to.equal(reDelegation!.blockTimestamp)
  })

  it('findDelegatorsForMember(memberB): both holder2 and holder5 present', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberB as HexAddress,
      { sort: 'votingPower', order: 'desc' },
    )

    expect(result.data).to.have.lengthOf(2)
    const addrs = result.data.map(d => d.address)
    expect(addrs).to.include.members([activity.holders[2].address, activity.holders[5].address])

    for (const row of result.data) {
      const matching = activity.delegations.find(d => d.from === row.address && d.to === activity.members.memberB)
      expect(matching, `expected delegation row in activity for ${row.address}`).to.exist
      expect(row.transactionHash).to.equal(matching!.transactionHash)
      expect(row.blockNumber).to.equal(matching!.blockNumber)
      expect(row.blockTimestamp).to.equal(matching!.blockTimestamp)
    }
  })

  it('pagination: pageSize=2 against memberA returns 2 rows on page 1, 1 row on page 2, no overlap', async () => {
    const page1 = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberA as HexAddress,
      { sort: 'votingPower', order: 'desc', page: 1, pageSize: 2 },
    )
    const page2 = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberA as HexAddress,
      { sort: 'votingPower', order: 'desc', page: 2, pageSize: 2 },
    )

    expect(page1.data).to.have.lengthOf(2)
    expect(page2.data).to.have.lengthOf(1)
    expect(page1.metadata.totalRecords).to.equal(3)
    expect(page1.metadata.totalPages).to.equal(2)
    expect(page1.metadata.page).to.equal(1)
    expect(page2.metadata.page).to.equal(2)

    const overlap = page1.data.map(r => r.address).filter(a => page2.data.some(r => r.address === a))
    expect(overlap, 'no delegator should appear on both pages').to.be.empty

    const combined = [...page1.data, ...page2.data].map(r => r.address)
    expect(combined).to.have.members([
      activity.holders[1].address,
      activity.holders[3].address,
      activity.holders[4].address,
    ])

    expect(page1.metadata.totalVotingPower).to.equal((160_000n * 10n ** 18n).toString())
    expect(page2.metadata.totalVotingPower).to.equal((160_000n * 10n ** 18n).toString())
  })

  it('pagination: page beyond range returns empty data with consistent totals', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberA as HexAddress,
      { sort: 'votingPower', order: 'desc', page: 99, pageSize: 2 },
    )

    expect(result.data).to.have.lengthOf(0)
    expect(result.metadata.totalVotingPower).to.equal((160_000n * 10n ** 18n).toString())
  })

  it('TokenMember rows for delegate targets reflect total VP delegated to each', async () => {
    const cases: Array<{ member: string; expected: bigint }> = [
      { member: activity.members.memberA, expected: 160_000n * 10n ** 18n },
      { member: activity.members.memberB, expected: 85_000n * 10n ** 18n },
      { member: activity.members.memberC, expected: 100_000n * 10n ** 18n },
    ]

    for (const { member, expected } of cases) {
      const tokenMember = await Models.TokenMember.findOne({
        network: NETWORK,
        tokenAddress: dep.token,
        memberAddress: member,
      })
      expect(tokenMember, `TokenMember row missing for delegate target ${member}`).to.exist
      expect(tokenMember!.votingPower).to.equal(expected.toString())
    }
  })

  it('metadata.totalVotingPower equals each TokenMember.votingPower across pages', async () => {
    const cases: Array<{ member: string; expected: bigint }> = [
      { member: activity.members.memberA, expected: 160_000n * 10n ** 18n },
      { member: activity.members.memberB, expected: 85_000n * 10n ** 18n },
      { member: activity.members.memberC, expected: 100_000n * 10n ** 18n },
    ]

    for (const { member, expected } of cases) {
      const result = await Models.LogDelegateChanged.findDelegatorsForMember(
        dep.token as HexAddress,
        NETWORK,
        member as HexAddress,
        { sort: 'votingPower', order: 'desc', pageSize: 1 },
      )
      expect(result.metadata.totalVotingPower, `totalVotingPower for ${member}`).to.equal(expected.toString())
    }
  })

  it('MemberController.getDelegatorsForMember (memberA, multi-delegator) returns all 3 with correct wrapper total', async () => {
    const result = await MemberController.getDelegatorsForMember(
      activity.members.memberA as HexAddress,
      { page: 1, pageSize: 10, sort: 'votingPower', order: 'desc' },
      { network: NETWORK, pluginAddress: dep.tokenVoting as HexAddress },
      {},
    )

    expect(result.data).to.have.lengthOf(3)
    expect(result.data.map(d => d.address)).to.have.members([
      activity.holders[1].address,
      activity.holders[3].address,
      activity.holders[4].address,
    ])
    for (const row of result.data) {
      expect(row.transactionHash).to.exist
      expect(row.blockNumber).to.be.a('number')
      expect(row.blockTimestamp).to.be.a('number')
    }
    expect(result.metadata.totalRecords).to.equal(3)
    expect(result.metadata.totalVotingPower).to.equal((160_000n * 10n ** 18n).toString())
  })

  it('querying an address with no delegators returns empty data + totalVotingPower="0"', async () => {
    const orphan = '0x1111111111111111111111111111111111111111' as HexAddress
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(dep.token as HexAddress, NETWORK, orphan, {
      sort: 'votingPower',
      order: 'desc',
    })

    expect(result.data).to.have.lengthOf(0)
    expect(result.metadata.totalRecords).to.equal(0)
    expect(result.metadata.totalVotingPower).to.equal('0')
  })

  it('deployer self-delegation is queryable as their own delegator', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      dep.deployer as HexAddress,
      { sort: 'votingPower', order: 'desc' },
    )

    expect(result.data).to.have.lengthOf(1)
    expect(result.data[0].address).to.equal(dep.deployer)
    expect(result.metadata.totalVotingPower).to.equal((1_000_000n * 10n ** 18n).toString())
  })
})
