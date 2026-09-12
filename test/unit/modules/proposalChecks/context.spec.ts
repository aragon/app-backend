import { Models } from '@dbModels'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import { fakeProposalAssessment, seedRequestOwners } from '@test/mock/fakeProposalAssessment'
import { PluginList } from '@test/mock/fakePlugins'
import RecipientResolver from '@modules/proposalChecks/recipients'
import { expect } from 'chai'
import * as sinon from 'sinon'

// DeCats DAO, polygon, proposal 1: one ERC20 transfer of 1369 DECATS to the creator.
const decatsTransfer = {
  to: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
  value: '0',
  data: '0xa9059cbb0000000000000000000000003d3972cd5df10faa6c085b5ab2f73aeeb5f19add00000000000000000000000000000000000000000000004a36b106ba25c40000',
}
const nativeSend = { to: '0x3d3972cD5Df10FAa6C085b5ab2F73aEEb5f19aDD', value: '1500000000000000000', data: '0x' }
const unknownCall = {
  to: '0x76dD967100000000000000000000000000000000',
  value: '0',
  data: '0xfeedbeef000000000000000000000000000000000000000000000000000000000000dead',
}

describe('proposalChecks/context', () => {
  let resolve: sinon.SinonStub

  beforeEach(async () => {
    resolve = sinon.stub(RecipientResolver, 'resolve').resolves({})
    await seedRequestOwners(fakeProposalAssessment())
  })

  afterEach(() => {
    resolve.restore()
  })

  it('flattens the captured actions at depth 0 with the DAO as caller and decodes the ones it knows', async () => {
    const request = await Models.ProposalAssessment.create(
      fakeProposalAssessment({
        captured: { ...fakeProposalAssessment().captured, rawActions: [decatsTransfer, nativeSend, unknownCall] },
      }),
    )

    const ctx = await AssessmentContextBuilder.build(request)

    expect(ctx.request.id).to.eq(request.id)
    expect(ctx.request.daoAddress).to.eq(request.daoAddress)
    expect(ctx.actions.map(a => a.path)).to.deep.eq(['0', '1', '2'])
    expect(ctx.actions.every(a => a.depth === 0 && a.caller === request.daoAddress && a.operation === 'call')).to.eq(
      true,
    )

    const [transfer, native, unknown] = ctx.actions
    expect(transfer.selector).to.eq('0xa9059cbb')
    expect(transfer.decoding).to.eq('known')
    expect(transfer.decoded).to.deep.eq({
      signature: 'transfer(address,uint256)',
      name: 'transfer',
      args: { to: '0x3d3972cD5Df10FAa6C085b5ab2F73aEEb5f19aDD', amount: '1369000000000000000000' },
    })

    expect(native.selector).to.eq(null)
    expect(native.decoding).to.eq('empty')
    expect(native.value).to.eq('1500000000000000000')

    expect(unknown.selector).to.eq('0xfeedbeef')
    expect(unknown.decoding).to.eq('unknown')
    expect(unknown.decoded).to.eq(null)
  })

  it('keeps amounts as decimal strings even above 2^53', () => {
    const big = {
      to: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
      value: '0',
      data: '0xa9059cbb0000000000000000000000003d3972cd5df10faa6c085b5ab2f73aeeb5f19add0000000000000000000000000000000000000000000000ffffffffffffffffff',
    }
    const [action] = AssessmentContextBuilder._flatten([big], '0xDDfa944A93ec63c73dF500d282D0c2De741aD752')
    expect(action.decoded?.args.amount).to.eq('4722366482869645213695')
  })

  it('keeps a few stray bytes as unknown, since they still reach a fallback function', () => {
    const stray = { to: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18', value: '0', data: '0x1234' }
    const [action] = AssessmentContextBuilder._flatten([stray], '0xDDfa944A93ec63c73dF500d282D0c2De741aD752')
    expect(action.selector).to.eq(null)
    expect(action.decoding).to.eq('unknown')
  })

  it('treats calldata that names a known selector but does not fit it as undecoded', () => {
    const truncated = { to: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18', value: '0', data: '0xa9059cbb00' }
    const [action] = AssessmentContextBuilder._flatten([truncated], '0xDDfa944A93ec63c73dF500d282D0c2De741aD752')
    expect(action.selector).to.eq('0xa9059cbb')
    expect(action.decoding).to.eq('unknown')
    expect(action.decoded).to.eq(null)
  })

  it('says which inputs are not available yet so checks can name what they could not verify', async () => {
    const request = await Models.ProposalAssessment.create(fakeProposalAssessment())

    const ctx = await AssessmentContextBuilder.build(request)

    expect(ctx.availability).to.deep.eq({ actions: 'ok', simulation: 'unsupported' })
  })

  it('builds an empty action list for a signalling proposal', async () => {
    const request = await Models.ProposalAssessment.create(
      fakeProposalAssessment({ captured: { ...fakeProposalAssessment().captured, rawActions: [] } }),
    )

    expect((await AssessmentContextBuilder.build(request)).actions).to.deep.eq([])
  })
})

describe('proposalChecks/context: plugins at the evidence block', () => {
  it('lists the plugins installed by the block and not yet uninstalled at it', async () => {
    const dao = PluginList[0].daoAddress
    const network = PluginList[0].network
    const at = (address: string, blockNumber: number, uninstalledAt: number | null) => ({
      ...PluginList[0],
      address,
      blockNumber,
      uninstalled: uninstalledAt === null ? { status: false } : { status: true, blockNumber: uninstalledAt },
    })
    await Models.Plugin.create(at('0x1111111111111111111111111111111111111111', 100, null) as any)
    await Models.Plugin.create(at('0x2222222222222222222222222222222222222222', 100, 150) as any)
    await Models.Plugin.create(at('0x3333333333333333333333333333333333333333', 300, null) as any)

    const early = await AssessmentContextBuilder._plugins(dao, network, 120)
    const late = await AssessmentContextBuilder._plugins(dao, network, 400)

    expect(early.plugins.map(p => p.address).sort()).to.deep.eq([
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ])
    expect(late.plugins.map(p => p.address).sort()).to.deep.eq([
      '0x1111111111111111111111111111111111111111',
      '0x3333333333333333333333333333333333333333',
    ])
  })
})

describe('proposalChecks/context: index invariants', () => {
  it('fails the attempt when the proposal or its plugin is not indexed', async () => {
    const request = await Models.ProposalAssessment.create(fakeProposalAssessment())
    let error: any
    try {
      await AssessmentContextBuilder.build(request)
    } catch (err) {
      error = err
    }
    expect(error?.message).to.contain('is not indexed')
  })
})
