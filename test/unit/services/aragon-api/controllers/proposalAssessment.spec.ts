import ProposalAssessmentController from '@api/controllers/proposalAssessment'
import { Models } from '@dbModels'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { IAssessmentRequestStatus } from '@types'
import { expect } from 'chai'

describe('ControllerV2: ProposalAssessment', () => {
  const proposalDoc = () => ({ ...ProposalList[0] })

  it('rejects an unknown proposal with 404', async () => {
    let error: any
    try {
      await ProposalAssessmentController.getLatest('nope')
    } catch (err) {
      error = err
    }
    expect(error?.status ?? error?.statusCode ?? error?.code).to.eq(404)
  })

  it('returns no assessment and no request for a proposal nobody asked to assess', async () => {
    const proposal = await Models.Proposal.create(proposalDoc())

    const body = await ProposalAssessmentController.getLatest(proposal.id)

    expect(body).to.deep.eq({ proposalId: proposal.id, currentRevisionId: null, assessment: null, request: null })
  })

  it('shows a pending request while the first assessment has not finished', async () => {
    const proposal = await Models.Proposal.create({
      ...proposalDoc(),
      assessment: { currentRevisionId: 'rev1', requestedGeneration: 1 },
    })
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({ proposalId: proposal.id, revisionId: 'rev1', generation: 1, publishedAt: new Date() }),
    )

    const body = await ProposalAssessmentController.getLatest(proposal.id)

    expect(body.assessment).to.eq(null)
    expect(body.request).to.include({
      generation: 1,
      revisionId: 'rev1',
      status: IAssessmentRequestStatus.Pending,
      attempts: 0,
    })
    expect(body.request!.publishedAt).to.be.instanceOf(Date)
    expect(body.request).to.not.have.property('lastError')
  })

  it('returns the promoted assessment with its findings, checks and coverage', async () => {
    const proposal = await Models.Proposal.create({
      ...proposalDoc(),
      assessment: { currentRevisionId: 'rev1', requestedGeneration: 1, latestCompletedAssessmentId: 'req1' },
    })
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'req1',
        proposalId: proposal.id,
        revisionId: 'rev1',
        generation: 1,
        status: IAssessmentRequestStatus.Incomplete,
        completedAt: new Date(),
        promotedAt: new Date(),
        findings: [{ id: 'assets/transfers:erc20:0', checkId: 'assets/transfers', kind: 'change', title: 'x' }],
        checks: {
          'assets/transfers': { status: 'ok' },
          'assets/nfts': { status: 'needsReview', reason: 'check not implemented yet' },
        },
        coverage: { implemented: ['assets/transfers'], missing: ['assets/nfts'] },
        evidence: {
          simulation: { status: 'ok', simulationId: 'sim-1', shareUrl: 'https://share/sim-1' },
          validation: { status: 'notYet' },
        },
      }),
    )

    const body = await ProposalAssessmentController.getLatest(proposal.id)

    expect(body.request).to.eq(null)
    expect(body.assessment).to.include({
      id: 'req1',
      generation: 1,
      revisionId: 'rev1',
      stale: false,
      status: 'incomplete',
    })
    expect(body.assessment!.findings).to.have.length(1)
    expect(body.assessment!.checks['assets/nfts']).to.deep.eq({
      status: 'needsReview',
      reason: 'check not implemented yet',
    })
    expect(body.assessment!.coverage).to.deep.eq({ implemented: ['assets/transfers'], missing: ['assets/nfts'] })
    expect(body.assessment!.evidence).to.deep.eq({
      simulation: { status: 'ok', simulationId: 'sim-1', shareUrl: 'https://share/sim-1' },
      validation: { status: 'notYet' },
    })
    expect(body.assessment!.evidenceBlock.number).to.eq(90094457)
  })

  it('lists every request newest first, results with findings and unfinished ones with their state', async () => {
    const proposal = await Models.Proposal.create({
      ...proposalDoc(),
      assessment: { currentRevisionId: 'rev2', requestedGeneration: 2, latestCompletedAssessmentId: 'req1' },
    })
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'req1',
        proposalId: proposal.id,
        revisionId: 'rev1',
        generation: 1,
        causeId: 'created:0xa:0',
        status: IAssessmentRequestStatus.Incomplete,
        completedAt: new Date(),
        promotedAt: new Date(),
        findings: [{ id: 'f1' }],
      }),
    )
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'req2',
        proposalId: proposal.id,
        revisionId: 'rev2',
        generation: 2,
        causeId: 'edited:0xb:0',
      }),
    )

    const body = await ProposalAssessmentController.getHistory(proposal.id, { page: 1, pageSize: 10 })

    expect(body.metadata).to.deep.eq({ page: 1, pageSize: 10, totalRecords: 2, totalPages: 1 })
    expect(body.data.map((r: any) => [r.id, r.generation, r.status, r.causeId, r.promoted])).to.deep.eq([
      ['req2', 2, 'pending', 'edited:0xb:0', false],
      ['req1', 1, 'incomplete', 'created:0xa:0', true],
    ])
    expect((body.data[1] as any).findings).to.deep.eq([{ id: 'f1' }])
    expect((body.data[1] as any).stale).to.eq(true)
    expect(body.data[0]).to.not.have.property('findings')
  })

  it('pages the history and rejects an unknown proposal', async () => {
    const proposal = await Models.Proposal.create({ ...proposalDoc(), assessment: { requestedGeneration: 3 } })
    for (const generation of [1, 2, 3]) {
      await Models.ProposalAssessment.create(
        fakeProposalAssessment({ id: `req${generation}`, proposalId: proposal.id, generation }),
      )
    }

    const second = await ProposalAssessmentController.getHistory(proposal.id, { page: 2, pageSize: 2 })

    expect(second.metadata).to.deep.eq({ page: 2, pageSize: 2, totalRecords: 3, totalPages: 2 })
    expect(second.data.map((r: any) => r.generation)).to.deep.eq([1])

    let error: any
    try {
      await ProposalAssessmentController.getHistory('nope', {})
    } catch (err) {
      error = err
    }
    expect(error?.status ?? error?.statusCode ?? error?.code).to.eq(404)
  })

  it('keeps showing the last result, flagged stale, while a newer revision is being assessed', async () => {
    const proposal = await Models.Proposal.create({
      ...proposalDoc(),
      assessment: { currentRevisionId: 'rev2', requestedGeneration: 2, latestCompletedAssessmentId: 'req1' },
    })
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'req1',
        proposalId: proposal.id,
        revisionId: 'rev1',
        generation: 1,
        status: IAssessmentRequestStatus.Incomplete,
        completedAt: new Date(),
      }),
    )
    await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        id: 'req2',
        proposalId: proposal.id,
        revisionId: 'rev2',
        generation: 2,
        status: IAssessmentRequestStatus.Failed,
        attempts: 2,
      }),
    )

    const body = await ProposalAssessmentController.getLatest(proposal.id)

    expect(body.currentRevisionId).to.eq('rev2')
    expect(body.assessment).to.include({ id: 'req1', stale: true })
    expect(body.request).to.include({ id: 'req2', status: IAssessmentRequestStatus.Failed, attempts: 2 })
  })
})
