import { ICollectionNames, ITransactionIndexCheckType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { mine, resetFork } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { waitForOne } from '../helpers/dbWaiters'
import { startServices, stopServices, waitForIndexerCatchup } from '../helpers/services'
import { txAndWaitIndexed } from '../helpers/txAndWait'
import { createProposalTx } from '../helpers/txActions'
import { setupTokenVotingDao } from '../setups/tokenVotingDaoSetup'
import type { TokenVotingDaoDeployment } from '../types/tokenVotingFixture'

const NETWORK = NetworksEnum.ethereumMainnet

describe.skip('PluginMetrics activity tracking — anvil', function () {
  this.timeout(600_000)
  this.slow(0)

  let dep: TokenVotingDaoDeployment

  let baselineFirst: number
  let baselineLast: number

  before(async () => {
    await resetFork()
    const startBlock = await getAnvilProvider().getBlockNumber()

    dep = await setupTokenVotingDao()

    // Activity #1 — proposal + auto-Yes from the deployer.
    await createProposalTx(dep)

    await startServices(startBlock)
    await waitForIndexerCatchup(await getAnvilProvider().getBlockNumber(), 180_000)

    const initial = await waitForOne(
      ICollectionNames.PluginMetrics,
      filter(),
      m => m.firstActivity != null && m.lastActivity != null && m.voteCount > 0,
    )
    baselineFirst = initial.firstActivity
    baselineLast = initial.lastActivity
  })

  after(() => stopServices())

  function filter() {
    return {
      network: NETWORK,
      pluginAddress: dep.tokenVoting,
      memberAddress: dep.deployer,
    }
  }

  it('initial catchup populates a coherent row (first ≤ last, counts > 0)', async () => {
    expect(baselineFirst).to.be.a('number').and.greaterThan(0)
    expect(baselineLast).to.be.a('number').and.greaterThan(0)
    expect(baselineFirst).to.be.at.most(baselineLast)
    const row = await waitForOne(ICollectionNames.PluginMetrics, filter(), () => true)
    expect(row.voteCount).to.be.greaterThan(0)
    expect(row.proposalCount).to.be.greaterThan(0)
  })

  it('second activity advances lastActivity but never regresses firstActivity', async () => {
    await mine(5, 1)
    const second = await txAndWaitIndexed(
      () => createProposalTx(dep),
      ITransactionIndexCheckType.PROPOSAL_CREATE,
      NETWORK,
    )
    expect(second.blockNumber).to.be.greaterThan(baselineLast)

    const row = await waitForOne(ICollectionNames.PluginMetrics, filter(), m => m.lastActivity >= second.blockNumber)
    expect(row.firstActivity, 'firstActivity must NOT advance').to.equal(baselineFirst)
    expect(row.lastActivity, 'lastActivity should advance to the new tx block').to.equal(second.blockNumber)
  })

  it('a third event keeps firstActivity pinned and bumps lastActivity again', async () => {
    await mine(3, 1)
    const third = await txAndWaitIndexed(
      () => createProposalTx(dep),
      ITransactionIndexCheckType.PROPOSAL_CREATE,
      NETWORK,
    )

    const row = await waitForOne(ICollectionNames.PluginMetrics, filter(), m => m.lastActivity >= third.blockNumber)
    expect(row.firstActivity).to.equal(baselineFirst)
    expect(row.lastActivity).to.equal(third.blockNumber)
    expect(row.firstActivity).to.be.at.most(row.lastActivity)
  })
})
