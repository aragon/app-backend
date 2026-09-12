import config from '@config'
import { Models } from '@dbModels'
import ProposalCheckQueue from '@modules/proposalChecks/queue'
import { ProposalCheckRequestPublisher } from '@services/aragon-dao/proposalCheckRequests'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { IAssessmentRequestStatus } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('AragonDao: ProposalCheckRequestPublisher', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('publishes pending requests and stamps them only after the broker confirms', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const publish = sandbox.stub(ProposalCheckQueue, 'publish').resolves()

    await ProposalCheckRequestPublisher.start()

    expect(publish.calledOnce).to.be.true
    expect(publish.args[0][0]).to.deep.eq({
      id: fakeProposalAssessment().id,
      params: { requestId: fakeProposalAssessment().id },
    })
    const stored = await Models.ProposalAssessment.findOne({ id: fakeProposalAssessment().id })
    expect(stored!.publishedAt).to.be.instanceOf(Date)
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Pending)
  })

  it('leaves a refused request unpublished with a backoff, so the next run retries it later', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const publish = sandbox.stub(ProposalCheckQueue, 'publish').rejects(new Error('rabbit down'))

    await ProposalCheckRequestPublisher.start()
    await ProposalCheckRequestPublisher.start()

    expect(publish.calledOnce).to.be.true
    const stored = await Models.ProposalAssessment.findOne({ id: fakeProposalAssessment().id })
    expect(stored!.publishedAt).to.eq(null)
    expect(stored!.lastError).to.eq('rabbit down')
    expect(stored!.nextAttemptAt.getTime()).to.be.greaterThan(Date.now())
  })

  it('republishes the same id when a previous run crashed between confirm and stamp', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const publish = sandbox.stub(ProposalCheckQueue, 'publish').resolves()
    sandbox.stub(Models.ProposalAssessment.prototype, 'markPublished').onFirstCall().rejects(new Error('crash'))

    await ProposalCheckRequestPublisher.start()
    sandbox.restore()
    sandbox = sinon.createSandbox()
    const publishAgain = sandbox.stub(ProposalCheckQueue, 'publish').resolves()
    await Models.ProposalAssessment.updateOne(
      { id: fakeProposalAssessment().id },
      { $set: { nextAttemptAt: new Date(0) } },
    )

    await ProposalCheckRequestPublisher.start()

    expect(publish.calledOnce).to.be.true
    expect(publishAgain.calledOnce).to.be.true
    const stored = await Models.ProposalAssessment.findOne({ id: fakeProposalAssessment().id })
    expect(stored!.publishedAt).to.be.instanceOf(Date)
  })

  it('keeps only the start of a very long broker error', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    sandbox.stub(ProposalCheckQueue, 'publish').rejects(new Error('x'.repeat(2000)))

    await ProposalCheckRequestPublisher.start()

    const stored = await Models.ProposalAssessment.findOne({ id: fakeProposalAssessment().id })
    expect(stored!.lastError).to.have.length(500)
  })

  it('skips requests that are already published or no longer pending', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment({ id: 'published', publishedAt: new Date() }))
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({ id: 'running', status: IAssessmentRequestStatus.Running }),
    )
    await Models.ProposalAssessment.create(fakeProposalAssessment({ id: 'pending' }))
    const publish = sandbox.stub(ProposalCheckQueue, 'publish').resolves()

    await ProposalCheckRequestPublisher.start()

    expect(publish.calledOnce).to.be.true
    expect(publish.args[0][0].id).to.eq('pending')
  })

  it('publishes oldest requests first and no more than the batch size', async () => {
    const batch = config.PROPOSAL_CHECKS.PUBLISH_BATCH_SIZE
    config.PROPOSAL_CHECKS.PUBLISH_BATCH_SIZE = 2
    try {
      for (const id of ['a', 'b', 'c']) {
        await Models.ProposalAssessment.create(fakeProposalAssessment({ id }))
      }
      const publish = sandbox.stub(ProposalCheckQueue, 'publish').resolves()

      await ProposalCheckRequestPublisher.start()

      expect(publish.args.map(a => a[0].id)).to.deep.eq(['a', 'b'])
    } finally {
      config.PROPOSAL_CHECKS.PUBLISH_BATCH_SIZE = batch
    }
  })

  it('hands a request whose worker died back to the queue once its lease expired', async () => {
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'stranded',
        status: IAssessmentRequestStatus.Running,
        publishedAt: new Date(Date.now() - 60_000),
        leaseToken: 'dead-worker',
        leaseUntil: new Date(Date.now() - 1000),
      }),
    )
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'alive',
        status: IAssessmentRequestStatus.Running,
        publishedAt: new Date(),
        leaseToken: 'busy-worker',
        leaseUntil: new Date(Date.now() + 60_000),
      }),
    )
    const publish = sandbox.stub(ProposalCheckQueue, 'publish').resolves()

    await ProposalCheckRequestPublisher.start()

    expect(publish.calledOnce).to.be.true
    expect(publish.args[0][0].id).to.eq('stranded')
    const stranded = await Models.ProposalAssessment.findOne({ id: 'stranded' })
    expect(stranded!.status).to.eq(IAssessmentRequestStatus.Failed)
    expect(stranded!.lastError).to.eq('lease expired without a result')
    expect(stranded!.leaseToken).to.eq(null)
    expect(stranded!.publishedAt).to.be.instanceOf(Date)
    const alive = await Models.ProposalAssessment.findOne({ id: 'alive' })
    expect(alive!.status).to.eq(IAssessmentRequestStatus.Running)
  })
})
