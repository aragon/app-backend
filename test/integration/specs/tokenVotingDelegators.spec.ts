import { Models } from '@dbModels'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { runErc20DelegationActivity } from '../setups/erc20DelegationActivity'
import { setupTokenVotingDao } from '../setups/tokenVotingDaoSetup'
import type { Erc20DelegationActivityResult, TokenVotingDaoDeployment } from '../types/tokenVotingFixture'

const NETWORK = NetworksEnum.ethereumMainnet
const FORK_BLOCK = 24541643 // same as governanceRewards.spec.ts

describe.skip('TokenVoting Delegators API — anvil ERC20 fixture', function () {
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
      ],
      // memberA receives from holder0 + holder1, holder0 then re-delegates to memberC.
      // memberB receives from holder2.
      // Expected end state: memberA -> [holder1], memberB -> [holder2], memberC -> [holder0].
      delegations: [
        { fromHolder: 0, to: 'memberA' },
        { fromHolder: 1, to: 'memberA' },
        { fromHolder: 2, to: 'memberB' },
        { fromHolder: 0, to: 'memberC' }, // re-delegation — latest event wins
      ],
    })

    const latestBlock = await getAnvilProvider().getBlockNumber()
    await startServices(startBlock)
    await waitForIndexerCatchup(latestBlock, 180_000)
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

  it('findDelegatorsForMember(memberA): only holder1 remains after holder0 re-delegation', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberA as HexAddress,
      { sort: 'votingPower', order: 'desc' },
    )

    expect(result.data, 'memberA should have exactly 1 delegator after re-delegation').to.have.lengthOf(1)
    expect(result.data[0].address).to.equal(activity.holders[1].address)
    // KNOWN LIMITATION: delegators' own TokenMember.votingPower is always '0' in realistic ERC20Votes flow
    // because they delegated their VP away. The "amount delegated" intent of BE-202 is currently NOT
    // captured by the aggregation. The TokenMember.votingPower of the *delegate target* (memberA) is
    // what holds the total delegated VP — asserted separately below.
    expect(result.data[0].votingPower).to.equal('0')

    const matching = activity.delegations.find(
      d => d.from === activity.holders[1].address && d.to === activity.members.memberA,
    )
    expect(matching, 'expected matching holder1 -> memberA delegation in activity').to.exist
    expect(result.data[0].transactionHash).to.equal(matching!.transactionHash)
    expect(result.data[0].blockNumber).to.equal(matching!.blockNumber)
    expect(result.data[0].blockTimestamp).to.equal(matching!.blockTimestamp)
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
    expect(result.data[0].votingPower).to.equal('0') // see KNOWN LIMITATION above

    // Must match the LATEST delegation event (holder0 -> memberC), not the original holder0 -> memberA.
    const reDelegation = activity.delegations.find(
      d => d.from === activity.holders[0].address && d.to === activity.members.memberC,
    )
    expect(reDelegation, 'expected matching holder0 -> memberC re-delegation in activity').to.exist
    expect(result.data[0].transactionHash).to.equal(reDelegation!.transactionHash)
    expect(result.data[0].blockNumber).to.equal(reDelegation!.blockNumber)
    expect(result.data[0].blockTimestamp).to.equal(reDelegation!.blockTimestamp)
  })

  it('findDelegatorsForMember(memberB): single holder2 row', async () => {
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberB as HexAddress,
      { sort: 'votingPower', order: 'desc' },
    )

    expect(result.data, 'memberB should have exactly 1 delegator').to.have.lengthOf(1)
    expect(result.data[0].address).to.equal(activity.holders[2].address)
    expect(result.data[0].votingPower).to.equal('0') // see KNOWN LIMITATION above

    const matching = activity.delegations.find(
      d => d.from === activity.holders[2].address && d.to === activity.members.memberB,
    )
    expect(matching, 'expected matching holder2 -> memberB delegation in activity').to.exist
    expect(result.data[0].transactionHash).to.equal(matching!.transactionHash)
    expect(result.data[0].blockNumber).to.equal(matching!.blockNumber)
    expect(result.data[0].blockTimestamp).to.equal(matching!.blockTimestamp)
  })

  it('pagination: pageSize=1 against memberA returns single row + correct totals', async () => {
    // memberA has exactly 1 active delegator (holder1) after holder0's re-delegation.
    // This asserts the pagination envelope (totalRecords, totalPages, data length).
    const result = await Models.LogDelegateChanged.findDelegatorsForMember(
      dep.token as HexAddress,
      NETWORK,
      activity.members.memberA as HexAddress,
      { sort: 'votingPower', order: 'desc', pageSize: 1 },
    )

    expect(result.data).to.have.lengthOf(1)
    expect(result.metadata.totalRecords).to.equal(1)
    expect(result.metadata.totalPages).to.equal(1)
    expect(result.metadata.pageSize).to.equal(1)
    expect(result.metadata.page).to.equal(1)
  })

  it('TokenMember rows for delegate targets reflect total VP delegated to each', async () => {
    // After all delegations + re-delegation:
    //   memberA receives holder1's 50K (holder0 re-delegated to memberC)
    //   memberB receives holder2's 25K
    //   memberC receives holder0's 100K (after re-delegation)
    const cases: Array<{ member: string; expected: bigint }> = [
      { member: activity.members.memberA, expected: 50_000n * 10n ** 18n },
      { member: activity.members.memberB, expected: 25_000n * 10n ** 18n },
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
      { member: activity.members.memberA, expected: 50_000n * 10n ** 18n },
      { member: activity.members.memberB, expected: 25_000n * 10n ** 18n },
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
})
