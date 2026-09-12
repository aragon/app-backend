import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ProposalCheckQueue from '@modules/proposalChecks/queue'
import { ProposalChecksConsumer } from '@services/aragon-dao/proposalChecks'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { EnumQueueName, IAssessmentRequestStatus } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('AragonDao: ProposalChecksConsumer', () => {
  let sandbox: SinonSandbox
  const id = fakeProposalAssessment().id
  const job = { id, params: { requestId: id } }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('claims a pending request under a lease and hands it to the executor', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const executor = sandbox.stub().resolves()
    const before = Date.now()

    await ProposalChecksConsumer.handle(job, executor)

    expect(executor.calledOnce).to.be.true
    expect(executor.args[0][0].id).to.eq(id)
    const stored = await Models.ProposalAssessment.findOne({ id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Running)
    expect(stored!.attempts).to.eq(1)
    expect(stored!.leaseToken).to.be.a('string')
    expect(stored!.leaseUntil!.getTime()).to.be.within(
      before + config.PROPOSAL_CHECKS.LEASE_TTL_MS - 5_000,
      Date.now() + config.PROPOSAL_CHECKS.LEASE_TTL_MS + 5_000,
    )
  })

  it('drops a duplicate delivery while the lease is live, without touching the running attempt', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const executor = sandbox.stub().resolves()
    sandbox.stub(logger, 'verbose')
    await ProposalChecksConsumer.handle(job, executor)

    await ProposalChecksConsumer.handle(job, executor)

    expect(executor.calledOnce).to.be.true
    const stored = await Models.ProposalAssessment.findOne({ id })
    expect(stored!.attempts).to.eq(1)
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Running)
  })

  it('takes over a request whose worker died, once its lease expired', async () => {
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        status: IAssessmentRequestStatus.Running,
        leaseUntil: new Date(Date.now() - 1000),
        leaseToken: 'dead-worker',
        attempts: 1,
      }),
    )
    const executor = sandbox.stub().resolves()

    await ProposalChecksConsumer.handle(job, executor)

    expect(executor.calledOnce).to.be.true
    const stored = await Models.ProposalAssessment.findOne({ id })
    expect(stored!.attempts).to.eq(2)
    expect(stored!.leaseToken).to.not.eq('dead-worker')
  })

  it('marks the request failed, drops the lease and rethrows so the queue envelope retries it', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const executor = sandbox.stub().rejects(new Error('engine exploded'))
    sandbox.stub(logger, 'error')

    let error: any
    try {
      await ProposalChecksConsumer.handle(job, executor)
    } catch (err) {
      error = err
    }

    expect(error?.message).to.eq('engine exploded')
    const stored = await Models.ProposalAssessment.findOne({ id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Failed)
    expect(stored!.lastError).to.eq('engine exploded')
    expect(stored!.leaseToken).to.eq(null)
  })

  it('lets a replacement attempt keep its lease when the expired one fails afterwards', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    const workerA = await Models.ProposalAssessment.claim(id, config.PROPOSAL_CHECKS.LEASE_TTL_MS)
    await Models.ProposalAssessment.updateOne({ id }, { $set: { leaseUntil: new Date(Date.now() - 1000) } })
    const workerB = await Models.ProposalAssessment.claim(id, config.PROPOSAL_CHECKS.LEASE_TTL_MS)

    await workerA!.markFailed(new Error('slow worker finally died'))

    const stored = await Models.ProposalAssessment.findOne({ id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Running)
    expect(stored!.leaseToken).to.eq(workerB!.leaseToken)
    expect(stored!.lastError).to.eq(null)
  })

  it('claims a failed request again when the queue retries it', async () => {
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({ status: IAssessmentRequestStatus.Failed, attempts: 1 }),
    )
    const executor = sandbox.stub().resolves()

    await ProposalChecksConsumer.handle(job, executor)

    expect(executor.calledOnce).to.be.true
    const stored = await Models.ProposalAssessment.findOne({ id })
    expect(stored!.status).to.eq(IAssessmentRequestStatus.Running)
    expect(stored!.attempts).to.eq(2)
  })

  it('drops a delivery for a request that already reached a result, and one for an unknown id', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment({ status: IAssessmentRequestStatus.Complete }))
    const executor = sandbox.stub().resolves()
    sandbox.stub(logger, 'verbose')

    await ProposalChecksConsumer.handle(job, executor)
    await ProposalChecksConsumer.handle({ id: 'nope', params: { requestId: 'nope' } }, executor)

    expect(executor.called).to.be.false
  })

  it('registers on the proposal checks queue with the retry envelope owning backoff and dead-lettering', async () => {
    const process = sandbox.stub(RabbitMQHelper, 'process').resolves()
    const handle = sandbox.stub(ProposalChecksConsumer, 'handle').resolves()
    const executor = sandbox.stub().resolves()

    await ProposalChecksConsumer.start(executor)
    await process.args[0][1](job)

    expect(process.args[0][0]).to.eq(EnumQueueName.proposalChecks)
    expect(process.args[0][2]).to.deep.eq(ProposalCheckQueue.retryOptions())
    expect(handle.calledOnceWith(job, executor)).to.be.true
  })
})
