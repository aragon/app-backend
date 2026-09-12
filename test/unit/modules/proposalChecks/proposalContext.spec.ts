import { Models } from '@dbModels'
import CreatorContextCheck from '@modules/proposalChecks/checks/context/creator'
import MetadataCheck from '@modules/proposalChecks/checks/context/metadata'
import IPFSModule from '@modules/ipfs'
import ProposalContext from '@modules/proposalChecks/proposalContext'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeProposalAssessment } from '@test/mock/fakeProposalAssessment'
import { type IAssessmentContext, IAssessmentCheckStatus, type ICreatorContext, type IMetadataFacts } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

const CREATOR = '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'
const OTHER = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x613ef3f5959688c3b422A545906F844b6f8c8F35'
const base = fakeProposalAssessment()
const request = {
  ...base,
  daoAddress: ProposalList[0].daoAddress as any,
  pluginAddress: ProposalList[0].pluginAddress as any,
  network: ProposalList[0].network,
  captured: {
    ...base.captured,
    metadataUri: ProposalList[0].metadataUri,
    evidenceBlock: { number: 500, hash: null, time: 1_000_000 },
  },
}
const metadataCtx = (metadata: Partial<IMetadataFacts>): IAssessmentContext => {
  const b = fakeAssessmentContext()
  return { ...b, metadata: { ...b.metadata, ...metadata } }
}
const creatorCtx = (creator: Partial<ICreatorContext>): IAssessmentContext => {
  const b = fakeAssessmentContext()
  return { ...b, creator: { ...b.creator, limits: [], ...creator } }
}

describe('proposalChecks/proposalContext', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('fetches IPFS metadata within limits and hashes it, and says what other references are', async () => {
    const fetch = sandbox
      .stub(IPFSModule, 'fetchMetadata')
      .resolves({ title: 'Fund the team', description: '<p>Pay Q4</p>' } as any)

    const ipfs = await ProposalContext.metadata(request as any, { title: 'Fund the team', description: null })
    const text = await ProposalContext.metadata(
      { ...request, captured: { ...request.captured, metadataUri: 'hello there' } } as any,
      null,
    )
    const web = await ProposalContext.metadata(
      { ...request, captured: { ...request.captured, metadataUri: 'https://x.y/z' } } as any,
      null,
    )
    const none = await ProposalContext.metadata(
      { ...request, captured: { ...request.captured, metadataUri: null } } as any,
      null,
    )

    expect(ipfs.uriKind).to.eq('ipfs')
    expect(ipfs.fetchStatus).to.eq('ok')
    expect(ipfs.fetched).to.include({ title: 'Fund the team', description: 'Pay Q4' })
    expect(ipfs.fetched!.hash).to.match(/^0x[0-9a-f]{64}$/)
    expect(fetch.calledOnce).to.be.true
    expect([text.uriKind, web.uriKind, none.uriKind]).to.deep.eq(['text', 'http', 'empty'])
    expect(text.fetchStatus).to.eq('skipped')
  })

  it('reports a failed fetch and keeps the indexed text', async () => {
    sandbox.stub(IPFSModule, 'fetchMetadata').resolves(null)

    const facts = await ProposalContext.metadata(request as any, { title: 'Indexed title', summary: 'short' })

    expect(facts.fetchStatus).to.eq('failed')
    expect(facts.indexed).to.deep.eq({ title: 'Indexed title', summary: 'short', description: null })
  })

  it('reads the creator history before the block, the first delegation to them, and the largest voter share', async () => {
    const seed = (overrides: any) => Models.Proposal.create({ ...ProposalList[0], ...overrides, id: undefined } as any)
    await seed({
      transactionHash: '0x' + 'a1'.repeat(32),
      proposalIndex: '1',
      blockNumber: 100,
      creatorAddress: CREATOR,
    })
    await seed({
      transactionHash: '0x' + 'a2'.repeat(32),
      proposalIndex: '2',
      blockNumber: 900,
      creatorAddress: CREATOR,
    })
    await seed({ transactionHash: '0x' + 'a3'.repeat(32), proposalIndex: '3', blockNumber: 100, creatorAddress: OTHER })
    const log = (blockNumber: number, to: string, i: number) => ({
      id: `d${i}`,
      tokenAddress: TOKEN,
      network: request.network,
      delegator: OTHER,
      fromDelegate: OTHER,
      toDelegate: to,
      blockNumber,
      blockTimestamp: blockNumber * 10,
      transactionHash: '0x' + 'b'.repeat(64),
      transactionIndex: 0,
      logIndex: i,
    })
    await Models.LogDelegateChanged.insertMany([
      log(300, CREATOR, 1),
      log(200, CREATOR, 2),
      log(50, OTHER, 3),
      log(490, CREATOR, 4),
    ])
    const vote = (member: string, power: string, i: number, blockNumber = 450) => ({
      id: `v${i}`,
      transactionHash: '0x' + 'c'.repeat(64),
      transactionIndex: 0,
      logIndex: i,
      blockNumber,
      network: request.network,
      daoAddress: request.daoAddress,
      pluginAddress: request.pluginAddress,
      memberAddress: member,
      tokenAddress: TOKEN,
      proposalIndex: '0',
      votingPower: power,
    })
    await Models.Vote.insertMany([
      vote(OTHER, '300', 1),
      vote(CREATOR, '100', 2),
      vote(CREATOR, '100', 3),
      vote(OTHER, '900', 4, 600),
    ])

    const context = await ProposalContext.creator(
      request as any,
      { creatorAddress: CREATOR, proposalIndex: '0' },
      TOKEN as any,
    )

    expect(context).to.deep.include({
      address: CREATOR,
      priorProposals: 1,
      powerAppearedAt: 2000,
      powerAgeSeconds: 998_000,
      votesCast: 2,
      largestVoter: OTHER,
      largestVoterShare: '0.6',
    })
    expect(context.limits).to.deep.eq([])
  })

  it('leaves unknown what the index does not hold', async () => {
    const noToken = await ProposalContext.creator(request as any, { creatorAddress: CREATOR, proposalIndex: '0' }, null)
    const noCreator = await ProposalContext.creator(request as any, null, TOKEN as any)

    expect(noToken).to.include({ priorProposals: 0, powerAppearedAt: null, votesCast: 0, largestVoterShare: null })
    expect(noToken.limits[0]).to.contain('no voting token')
    expect(noCreator.limits).to.deep.eq(['the creator is not indexed'])
  })
})

describe('proposalChecks/checks/context/metadata', () => {
  it('is ok with a usable title, naming the metadata hash when fetched', () => {
    const fetched = { title: 'Fund the team', summary: null, description: 'Pay Q4', hash: '0x' + 'ab'.repeat(32) }
    const ok = MetadataCheck.run(metadataCtx({ fetched, fetchStatus: 'ok' }))
    const indexedOnly = MetadataCheck.run(metadataCtx({ fetchStatus: 'failed' }))

    expect(ok.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(ok.reason).to.contain('explained: "Fund the team", metadata hash 0xabababababababab')
    expect(indexedOnly.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(indexedOnly.reason).to.contain('from the index')
  })

  it('needs review for a placeholder title, free text as reference, or nothing to read at all', () => {
    const placeholder = MetadataCheck.run(metadataCtx({ indexed: { title: '.', summary: null, description: null } }))
    const freeText = MetadataCheck.run(metadataCtx({ uri: 'Vault parameter change', uriKind: 'text' }))
    const nothing = MetadataCheck.run(
      metadataCtx({ uri: null, uriKind: 'empty', indexed: { title: null, summary: null, description: null } }),
    )
    const unreachable = MetadataCheck.run(
      metadataCtx({ fetchStatus: 'failed', indexed: { title: null, summary: null, description: null } }),
    )

    for (const r of [placeholder, freeText, nothing, unreachable]) {
      expect(r.status).to.eq(IAssessmentCheckStatus.NeedsReview)
      expect(r.findings).to.have.length(1)
      expect(r.findings[0].notify).to.be.true
      expect(r.findings[0].title).to.eq('The proposal does not explain what it asks for')
    }
    expect(placeholder.findings[0].details[0]).to.eq('the title "." is a placeholder')
    expect(freeText.findings[0].details[0]).to.contain('free text where a reference was expected')
    expect(nothing.findings[0].details[0]).to.contain('no metadata reference and no title or description')
    expect(unreachable.findings[0].details[0]).to.contain('could not be fetched and the index holds no title')
    expect(unreachable.findings[0].evidenceLimit).to.contain('may still exist at its referenced location')
  })
})

describe('proposalChecks/checks/context/creator', () => {
  it('writes the three lines from what is known, as a dashboard-only finding', () => {
    const result = CreatorContextCheck.run(
      creatorCtx({
        address: CREATOR,
        priorProposals: 3,
        powerAgeSeconds: 2 * 86400 + 5,
        votesCast: 4,
        largestVoterShare: '0.5527',
        largestVoter: OTHER,
      }),
    )

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings[0].notify).to.be.false
    expect(result.findings[0].details).to.deep.eq([
      'the creator has made 3 earlier proposals on this DAO',
      "the creator's voting power appeared 2 days before this proposal",
      'the largest voter holds 55.3% of the votes cast (4 voters)',
    ])
  })

  it('says unknown where it is unknown, and first proposal when it is', () => {
    const result = CreatorContextCheck.run(
      creatorCtx({
        address: CREATOR,
        priorProposals: 0,
        powerAgeSeconds: 3600,
        votesCast: 0,
        limits: ['no delegation to the creator is indexed'],
      }),
    )

    expect(result.findings[0].details).to.deep.eq([
      'first proposal from this creator on this DAO',
      "the creator's voting power appeared less than a day before this proposal",
      "no votes cast yet, so the largest voter's share is unknown",
    ])
    expect(result.findings[0].evidenceLimit).to.eq('no delegation to the creator is indexed')
    expect(
      CreatorContextCheck.run(creatorCtx({ priorProposals: null, powerAgeSeconds: null })).findings[0].details[0],
    ).to.contain('is unknown')
  })
})
