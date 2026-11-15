import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Revisions from '@modules/proposalChecks/revisions'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { type IAssessmentRequestInput, IAssessmentRequestStatus, PROPOSAL_CHECKS_RULES_VERSION } from '@types'
import { expect } from 'chai'
import { type ClientSession } from 'mongoose'

describe('Model: ProposalAssessment', () => {
  it('stores a request as pending by default', async () => {
    const doc = await Models.ProposalAssessment.create(fakeProposalAssessment())

    expect(doc.status).to.eq(IAssessmentRequestStatus.Pending)
    expect(doc.attempts).to.eq(0)
    expect(doc.publishedAt).to.eq(null)
    expect(doc.captured.rawActions).to.have.length(1)
    expect(doc.captured.evidenceBlock.number).to.eq(90094457)
  })

  it('refuses a second request with the same id', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())

    let error: any
    try {
      await Models.ProposalAssessment.create(fakeProposalAssessment({ generation: 2 }))
    } catch (err) {
      error = err
    }

    expect(error?.code).to.eq(11000)
    expect(await Models.ProposalAssessment.countDocuments({})).to.eq(1)
  })

  it('keeps every generation of the same proposal as separate history', async () => {
    await Models.ProposalAssessment.create(fakeProposalAssessment())
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({ id: 'req:0xproposal:rev1:edited:0xtx2:0:1', causeId: 'edited:0xtx2:0', generation: 2 }),
    )

    const latest = await Models.ProposalAssessment.findOne({ proposalId: fakeProposalAssessment().proposalId }).sort({
      generation: -1,
    })

    expect(latest!.generation).to.eq(2)
    expect(await Models.ProposalAssessment.countDocuments({})).to.eq(2)
  })

  it('rejects a status outside the request lifecycle', async () => {
    let error: any
    try {
      await Models.ProposalAssessment.create(fakeProposalAssessment({ status: 'done' }))
    } catch (err) {
      error = err
    }

    expect(error?.name).to.eq('ValidationError')
  })

  it('rejects a request without its captured revision', async () => {
    let error: any
    try {
      await Models.ProposalAssessment.create(fakeProposalAssessment({ captured: undefined }))
    } catch (err) {
      error = err
    }

    expect(error?.name).to.eq('ValidationError')
  })

  it('has the indexes the scheduler and workers rely on', async () => {
    const indexes = await Models.ProposalAssessment.collection.indexes()
    const keys = indexes.map((i: any) => JSON.stringify(i.key))

    expect(keys).to.include(JSON.stringify({ id: 1 }))
    expect(keys).to.include(JSON.stringify({ proposalId: 1, generation: -1 }))
    expect(keys).to.include(JSON.stringify({ status: 1, publishedAt: 1, nextAttemptAt: 1 }))
    expect(indexes.find((i: any) => i.key.id === 1)?.unique).to.eq(true)
  })
})

describe('Model: ProposalAssessment.requestForRevision', () => {
  const proposalDoc = () => ({
    ...ProposalList[0],
    rawActions: [{ to: '0x0000000000000000000000000000000000000001', value: '0', data: '0x' }],
  })
  const eventAt = (proposal: any, blockNumber: number, logIndex = 0, blockHash: string | null = null) => ({
    blockNumber,
    blockHash,
    transactionHash: `${proposal.transactionHash}${blockNumber}`,
    logIndex,
  })
  const plain = (proposal: any) => (typeof proposal.toObject === 'function' ? proposal.toObject() : proposal)
  const input = (proposal: any, kind: 'created' | 'edited', event: any): IAssessmentRequestInput => ({
    proposal: { ...plain(proposal), allowFailureMap: '0' },
    event,
    causeId: Revisions.causeIdForEvent(kind, event),
    evidenceBlock: { number: event.blockNumber, hash: event.blockHash, time: proposal.blockTimestamp },
  })
  const inTx = (fn: (session: ClientSession) => Promise<any>): Promise<any> =>
    DbTx.executeTxFn(
      async ({ session }: { session: ClientSession }) => {
        const result = await fn(session)
        await DbTx.safeCommit(session)
        return result
      },
      { stopRetry: true, throwOnStop: true },
    )

  it('inserts a pending request with generation 1 and points the proposal at the revision', async () => {
    const proposal = await Models.Proposal.create(proposalDoc())
    const event = eventAt(proposal, 100)

    const { created, request } = await inTx(session =>
      Models.ProposalAssessment.requestForRevision(input(proposal, 'created', event), session),
    )

    expect(created).to.eq(true)
    expect(request.generation).to.eq(1)
    expect(request.status).to.eq(IAssessmentRequestStatus.Pending)
    expect(request.rulesVersion).to.eq(PROPOSAL_CHECKS_RULES_VERSION)
    expect(request.captured.rawActions).to.deep.eq(proposalDoc().rawActions)
    expect(request.captured.allowFailureMap).to.eq('0')
    expect(request.captured.metadataUri).to.eq(proposal.metadataUri)

    const stored = await Models.Proposal.findOne({ id: proposal.id })
    expect(stored!.assessment.requestedGeneration).to.eq(1)
    expect(stored!.assessment.currentRevisionId).to.eq(request.revisionId)
  })

  it('returns the existing request and leaves the generation alone when the same event is seen again', async () => {
    const proposal = await Models.Proposal.create(proposalDoc())
    const event = eventAt(proposal, 100)
    const first = await inTx(s => Models.ProposalAssessment.requestForRevision(input(proposal, 'created', event), s))

    const second = await inTx(s => Models.ProposalAssessment.requestForRevision(input(proposal, 'created', event), s))

    expect(second.created).to.eq(false)
    expect(second.request.id).to.eq(first.request.id)
    expect(await Models.ProposalAssessment.countDocuments({})).to.eq(1)
    const stored = await Models.Proposal.findOne({ id: proposal.id })
    expect(stored!.assessment.requestedGeneration).to.eq(1)
  })

  it('allocates the next generation and makes the edit the current revision', async () => {
    const proposal = await Models.Proposal.create(proposalDoc())
    const first = await inTx(s =>
      Models.ProposalAssessment.requestForRevision(input(proposal, 'created', eventAt(proposal, 100)), s),
    )

    const edited = { ...proposalDoc(), id: proposal.id, rawActions: [] }
    const second = await inTx(s =>
      Models.ProposalAssessment.requestForRevision(input(edited, 'edited', eventAt(proposal, 200, 7)), s),
    )

    expect(second.created).to.eq(true)
    expect(second.request.generation).to.eq(2)
    expect(second.request.revisionId).to.not.eq(first.request.revisionId)
    expect(second.request.captured.rawActions).to.deep.eq([])
    const stored = await Models.Proposal.findOne({ id: proposal.id })
    expect(stored!.assessment.requestedGeneration).to.eq(2)
    expect(stored!.assessment.currentRevisionId).to.eq(second.request.revisionId)
  })

  it('treats the same event re-included in a different block as a new revision', async () => {
    const proposal = await Models.Proposal.create(proposalDoc())
    const first = await inTx(s =>
      Models.ProposalAssessment.requestForRevision(input(proposal, 'created', eventAt(proposal, 100, 0, '0xaaa')), s),
    )

    const reincluded = await inTx(s =>
      Models.ProposalAssessment.requestForRevision(input(proposal, 'created', eventAt(proposal, 100, 0, '0xbbb')), s),
    )

    expect(reincluded.created).to.eq(true)
    expect(reincluded.request.revisionId).to.not.eq(first.request.revisionId)
    expect(await Models.ProposalAssessment.countDocuments({})).to.eq(2)
  })

  it('refuses to run outside an open transaction and changes nothing', async () => {
    const proposal = await Models.Proposal.create(proposalDoc())

    let error: any
    try {
      await Models.ProposalAssessment.requestForRevision(
        input(proposal, 'created', eventAt(proposal, 100)),
        undefined as any,
      )
    } catch (err) {
      error = err
    }

    expect(error).to.be.instanceOf(Error)
    expect(await Models.ProposalAssessment.countDocuments({})).to.eq(0)
    const stored = await Models.Proposal.findOne({ id: proposal.id })
    expect(stored!.assessment.requestedGeneration).to.eq(0)
  })

  it('refuses a request for a proposal that is not stored and rolls the transaction back', async () => {
    let error: any
    try {
      await inTx(s =>
        Models.ProposalAssessment.requestForRevision(
          input({ ...proposalDoc(), id: 'missing' }, 'created', eventAt({ transactionHash: '0x1' }, 100)),
          s,
        ),
      )
    } catch (err) {
      error = err
    }
    expect(error).to.be.instanceOf(Error)
    expect(await Models.ProposalAssessment.countDocuments({})).to.eq(0)
  })
})
