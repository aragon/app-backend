import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import Web3Helper from '@helpers/web3'
import DbTx from '@modules/dbTx'
import { IMPLEMENTED_CHECKS } from '@modules/proposalChecks/checks/index'
import AssessmentExecutor from '@modules/proposalChecks/executor'
import RecipientResolver from '@modules/proposalChecks/recipients'
import WatchedTargets from '@modules/proposalChecks/watchedTargets'
import Revisions from '@modules/proposalChecks/revisions'
import { ProposalChecksConsumer } from '@services/aragon-dao/proposalChecks'
import { ProposalList } from '@test/mock/fakeProposal'
import { seedRequestOwners } from '@test/mock/fakeProposalAssessment'
import { DECATS } from '@test/mock/proposalChecks/incidents'
import { IAssessmentCheckStatus, IAssessmentRequestStatus, type IRawAction } from '@types'
import { expect } from 'chai'
import { type ClientSession } from 'mongoose'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const request = async (proposal: any, kind: 'created' | 'edited', blockNumber: number, rawActions: IRawAction[]) => {
  await seedRequestOwners({
    proposalId: proposal.id,
    pluginAddress: proposal.pluginAddress,
    daoAddress: proposal.daoAddress,
    network: proposal.network,
  })
  return DbTx.executeTxFn(
    async ({ session }: { session: ClientSession }) => {
      const event = {
        blockNumber,
        blockHash: null,
        transactionHash: `0xtx${blockNumber}`,
        logIndex: 0,
      }
      const { request } = await Models.ProposalAssessment.requestForRevision(
        {
          proposal: { ...proposal.toObject(), rawActions, allowFailureMap: '0' },
          event,
          causeId: Revisions.causeIdForEvent(kind, event),
          evidenceBlock: { number: blockNumber, hash: null, time: proposal.blockTimestamp },
        },
        session,
      )
      await DbTx.safeCommit(session)
      return request
    },
    { stopRetry: true, throwOnStop: true },
  )
}

describe('proposalChecks/executor', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'verbose')
    sandbox.stub(RecipientResolver, 'resolve').resolves({})
    sandbox.stub(Web3Helper, 'getBlock').resolves({ hash: '0x' + 'ab'.repeat(32) } as any)
    sandbox.stub(WatchedTargets, 'register').resolves()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it("assesses a delivered request end to end and makes it the proposal's current assessment, sending nothing", async () => {
    const proposal = await Models.Proposal.create({ ...ProposalList[0], daoAddress: DECATS.daoAddress })
    const req = await request(proposal, 'created', 100, DECATS.rawActions)
    const job = { id: req.id, params: { requestId: req.id } }

    await ProposalChecksConsumer.handle(job, AssessmentExecutor.run)

    const stored = await Models.ProposalAssessment.findOne({ id: req.id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(stored!.findings.map(f => f.id)).to.deep.eq(['assets/transfers:erc20:0', 'context/creator:lines'])
    expect(stored!.checks['assets/transfers']).to.eq(IAssessmentCheckStatus.Ok)
    expect(stored!.checks['execution/crossChain']).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(stored!.coverage!.implemented).to.deep.eq([
      'assets/transfers',
      'assets/allowances',
      'assets/nfts',
      'assets/mintBurn',
      'control/permissions',
      'control/conditions',
      'control/upgrade',
      'control/initializer',
      'control/pluginSetup',
      'control/components',
      'control/ownership',
      'voting/settings',
      'voting/members',
      'voting/stages',
      'voting/actionsChanged',
      'execution/decode',
      'execution/nested',
      'execution/delegatecall',
      'execution/sequence',
      'validation/voting',
      'validation/stages',
      'validation/execution',
      'context/metadata',
      'context/creator',
    ])
    expect(stored!.coverage!.missing).to.have.length(3)
    expect(stored!.completedAt).to.be.instanceOf(Date)
    expect(stored!.promotedAt).to.be.instanceOf(Date)
    expect(stored!.evidence!.simulation.status).to.eq('unsupported')
    expect(stored!.evidence!.validation.status).to.eq('unsupported')
    expect(stored!.captured.evidenceBlock.hash).to.eq('0x' + 'ab'.repeat(32))
    expect((WatchedTargets.register as sinon.SinonStub).calledOnce).to.be.true
    expect((WatchedTargets.register as sinon.SinonStub).args[0][0].id).to.eq(req.id)

    const pointers = await Models.Proposal.findOne({ id: proposal.id })
    expect(pointers!.assessment.readinessKey).to.be.a('string')
    // The fixture's vote has not started at the evidence time, so the next boundary is its start date.
    expect(pointers!.assessment.nextBoundary).to.eq(ProposalList[0].startDate)
    expect(pointers!.assessment.lifecycle).to.eq(null)

    const owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(req.id)
    expect(await Models.TelegramNotificationOutbox.countDocuments({})).to.eq(0)
  })

  it('stores a stale generation as history without promoting it, then promotes the current one', async () => {
    const proposal = await Models.Proposal.create({ ...ProposalList[0], daoAddress: DECATS.daoAddress })
    const older = await request(proposal, 'created', 100, DECATS.rawActions)
    const newer = await request(proposal, 'edited', 200, [])

    await ProposalChecksConsumer.handle({ id: older.id, params: { requestId: older.id } }, AssessmentExecutor.run)
    let owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(null)
    const staleStored = await Models.ProposalAssessment.findOne({ id: older.id })
    expect(staleStored!.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(staleStored!.promotedAt).to.eq(null)

    await ProposalChecksConsumer.handle({ id: newer.id, params: { requestId: newer.id } }, AssessmentExecutor.run)
    owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(newer.id)
  })

  it('fails the attempt when a check failed, so the queue retries instead of storing a half result', async () => {
    const proposal = await Models.Proposal.create({ ...ProposalList[0], daoAddress: DECATS.daoAddress })
    const req = await request(proposal, 'created', 100, DECATS.rawActions)
    const exploding = {
      id: 'execution/crossChain',
      run: () => {
        throw new Error('lane lookup exploded')
      },
    }
    sandbox.stub(logger, 'error')

    let error: any
    try {
      await ProposalChecksConsumer.handle({ id: req.id, params: { requestId: req.id } }, r =>
        AssessmentExecutor.run(r, [...IMPLEMENTED_CHECKS, exploding]),
      )
    } catch (err) {
      error = err
    }

    expect(error?.message).to.contain('execution/crossChain: lane lookup exploded')
    const stored = await Models.ProposalAssessment.findOne({ id: req.id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Failed)
    expect(stored!.findings).to.deep.eq([])
    expect(stored!.completedAt).to.eq(null)
    const owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(null)
  })

  it('does not store or promote when the lease moved to another attempt mid-run', async () => {
    const proposal = await Models.Proposal.create({ ...ProposalList[0], daoAddress: DECATS.daoAddress })
    const req = await request(proposal, 'created', 100, DECATS.rawActions)
    const claimed = await Models.ProposalAssessment.claim(req.id, config.PROPOSAL_CHECKS.LEASE_TTL_MS)
    await Models.ProposalAssessment.updateOne({ id: req.id }, { $set: { leaseToken: 'someone-else' } })
    sandbox.stub(logger, 'warn')

    await AssessmentExecutor.run(claimed!)

    const stored = await Models.ProposalAssessment.findOne({ id: req.id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Running)
    expect(stored!.leaseToken).to.eq('someone-else')
    expect(stored!.findings).to.deep.eq([])
    const owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(null)
  })

  it('stores nothing when promotion fails, and completes on redelivery', async () => {
    const proposal = await Models.Proposal.create({ ...ProposalList[0], daoAddress: DECATS.daoAddress })
    const req = await request(proposal, 'created', 100, DECATS.rawActions)
    const job = { id: req.id, params: { requestId: req.id } }
    const promote = sandbox.stub(Models.ProposalAssessment.prototype, 'promote')
    promote.onFirstCall().rejects(new Error('pointer write refused'))
    promote.callThrough()
    sandbox.stub(logger, 'error')

    let error: any
    try {
      await ProposalChecksConsumer.handle(job, AssessmentExecutor.run)
    } catch (err) {
      error = err
    }
    expect(error?.message).to.eq('pointer write refused')
    let stored = await Models.ProposalAssessment.findOne({ id: req.id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Failed)
    expect(stored!.findings).to.deep.eq([])
    expect(stored!.completedAt).to.eq(null)

    await ProposalChecksConsumer.handle(job, AssessmentExecutor.run)

    stored = await Models.ProposalAssessment.findOne({ id: req.id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Incomplete)
    expect(stored!.promotedAt).to.be.instanceOf(Date)
    const owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(req.id)
  })

  it('drops the attempt and fails the request when the evidence block was replaced since it was captured', async () => {
    const proposal = await Models.Proposal.create({ ...ProposalList[0], daoAddress: DECATS.daoAddress })
    const req = await request(proposal, 'created', 100, DECATS.rawActions)
    await Models.ProposalAssessment.updateOne(
      { id: req.id },
      { $set: { 'captured.evidenceBlock.hash': '0x' + 'cd'.repeat(32) } },
    )
    const claimed = await Models.ProposalAssessment.claim(req.id, config.PROPOSAL_CHECKS.LEASE_TTL_MS)
    sandbox.stub(logger, 'warn')

    await AssessmentExecutor.run(claimed!)

    const stored = await Models.ProposalAssessment.findOne({ id: req.id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Failed)
    expect(stored!.lastError).to.contain('evidence block 100 was replaced')
    expect(stored!.findings).to.deep.eq([])
    const owner = await Models.Proposal.findOne({ id: proposal.id })
    expect(owner!.assessment.latestCompletedAssessmentId).to.eq(null)
  })
})
