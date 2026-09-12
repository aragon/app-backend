import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import DbTx from '@modules/dbTx'
import ProposalCheckDeadlines from '@modules/proposalChecks/deadlines'
import Readiness from '@modules/proposalChecks/readiness'
import Revisions from '@modules/proposalChecks/revisions'
import { PluginList } from '@test/mock/fakePlugins'
import { ProposalList } from '@test/mock/fakeProposal'
import { DECATS } from '@test/mock/proposalChecks/incidents'
import { expect } from 'chai'
import { type ClientSession } from 'mongoose'
import sinon from 'sinon'

const NOW = Math.floor(Date.now() / 1000)
const CHAIN = { block: 999, time: NOW }
const untested = {
  status: 'unsupported' as const,
  reason: 'readiness re-evaluated on time only',
  simulationId: null,
  block: 0,
}
const passing = {
  totalVotes: 2,
  votesByOption: [
    { type: 2, totalVotingPower: '600' },
    { type: 3, totalVotingPower: '100' },
  ],
}

const seed = async (overrides: Record<string, unknown>, assessment: Record<string, unknown>) => {
  const proposal = await Models.Proposal.create({
    ...ProposalList[0],
    id: undefined,
    daoAddress: DECATS.daoAddress,
    settings: { ...ProposalList[0].settings, votingMode: 0 },
    snapshot: { totalSupply: '1000' },
    ...overrides,
  } as any)
  await Models.Plugin.create({
    ...PluginList[0],
    address: proposal.pluginAddress,
    network: proposal.network,
    daoAddress: DECATS.daoAddress,
  } as any)
  await DbTx.executeTxFn(
    async ({ session }: { session: ClientSession }) => {
      const event = { blockNumber: 100, blockHash: null, transactionHash: '0xtx100', logIndex: 0 }
      await Models.ProposalAssessment.requestForRevision(
        {
          proposal: { ...proposal.toObject(), rawActions: DECATS.rawActions, allowFailureMap: '0' },
          event,
          causeId: Revisions.causeIdForEvent('created', event),
          evidenceBlock: { number: 100, hash: null, time: NOW - 5000 },
        },
        session,
      )
      await DbTx.safeCommit(session)
    },
    { stopRetry: true, throwOnStop: true },
  )
  await Models.Proposal.updateOne(
    { id: proposal.id },
    { $set: Object.fromEntries(Object.entries(assessment).map(([k, v]) => [`assessment.${k}`, v])) },
  )
  return proposal
}
const requests = async (id: string) =>
  (await Models.ProposalAssessment.find({ proposalId: id }).sort({ generation: 1 })).map(r => r.causeId)

describe('proposalChecks/deadlines', () => {
  const sandbox = sinon.createSandbox()
  beforeEach(() => {
    sandbox.stub(Web3Helper, 'getBlockNumber').resolves(CHAIN.block)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(CHAIN.time)
  })
  afterEach(() => sandbox.restore())

  it('asks for the assessment again when a passed boundary changed the readiness, and parks the boundary until it lands', async () => {
    const proposal = await seed(
      { startDate: NOW - 4000, endDate: NOW - 10, metrics: passing },
      { nextBoundary: NOW - 10, readinessKey: '|n|voting-end|voting-end@' + (NOW - 10) },
    )

    const result = await ProposalCheckDeadlines.run()

    expect(result).to.deep.eq({ due: 1, refreshed: 1, closed: 0 })
    expect(await requests(proposal.id)).to.deep.eq(['created:0xtx100:0', `deadline:voting-end:${NOW - 10}`])
    const stored = await Models.Proposal.findOne({ id: proposal.id })
    expect(stored!.assessment.nextBoundary).to.eq(null)
    const refreshed = await Models.ProposalAssessment.findOne({ proposalId: proposal.id, generation: 2 })
    expect(refreshed!.captured.evidenceBlock).to.deep.include({ number: 999, time: NOW })
  })

  it('only moves the boundary on when the readiness is what the assessment already saw', async () => {
    const proposal = await seed(
      { startDate: NOW - 4000, endDate: NOW + 500, metrics: passing },
      { nextBoundary: NOW - 1 },
    )
    const key = Readiness.key(
      Readiness.evaluate((await Models.Proposal.findOne({ id: proposal.id }))!, 'tokenVoting', NOW, untested),
    )
    await Models.Proposal.updateOne({ id: proposal.id }, { $set: { 'assessment.readinessKey': key } })

    const result = await ProposalCheckDeadlines.run()

    expect(result).to.deep.eq({ due: 1, refreshed: 0, closed: 0 })
    expect(await requests(proposal.id)).to.deep.eq(['created:0xtx100:0'])
    expect((await Models.Proposal.findOne({ id: proposal.id }))!.assessment.nextBoundary).to.eq(NOW + 500)
  })

  it('closes the lifecycle and frees the watched targets on a proven outcome, and leaves closed proposals alone afterwards', async () => {
    const proposal = await seed(
      {
        startDate: NOW - 4000,
        endDate: NOW - 10,
        metrics: { totalVotes: 1, votesByOption: [{ type: 3, totalVotingPower: '900' }] },
      },
      { nextBoundary: NOW - 10, readinessKey: 'x' },
    )
    await Models.ProposalWatchedTarget.register(
      proposal.network,
      [{ address: DECATS.daoAddress, kind: 'dao' }],
      proposal.id,
      100,
    )

    const first = await ProposalCheckDeadlines.run()
    const second = await ProposalCheckDeadlines.run()

    expect(first).to.deep.eq({ due: 1, refreshed: 0, closed: 1 })
    expect(second).to.deep.eq({ due: 0, refreshed: 0, closed: 0 })
    const stored = await Models.Proposal.findOne({ id: proposal.id })
    expect(stored!.assessment.lifecycle).to.eq('defeated')
    expect(stored!.assessment.nextBoundary).to.eq(null)
    expect(await Models.ProposalWatchedTarget.countDocuments({})).to.eq(0)
    expect(await requests(proposal.id)).to.deep.eq(['created:0xtx100:0'])
  })

  it('ignores proposals whose boundary is still ahead', async () => {
    await seed({ startDate: NOW - 4000, endDate: NOW + 500 }, { nextBoundary: NOW + 500, readinessKey: 'x' })

    expect(await ProposalCheckDeadlines.run()).to.deep.eq({ due: 0, refreshed: 0, closed: 0 })
  })
})
