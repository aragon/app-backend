import AbiResolver from '@modules/proposalChecks/abiResolver'
import RecipientResolver from '@modules/proposalChecks/recipients'
import AssessmentContextBuilder, { MAX_NESTED_DEPTH } from '@modules/proposalChecks/context'
import NestedCheck from '@modules/proposalChecks/checks/execution/nested'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { seedRequestOwners } from '@test/mock/fakeProposalAssessment'
import { DECATS, TERM_META_VAULT } from '@test/mock/proposalChecks/incidents'
import { IAssessmentCheckStatus } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'

const DAO = '0xDDfa944A93ec63c73dF500d282D0c2De741aD752'
const OTHER_DAO = '0x1111111111111111111111111111111111111111'
const SAFE = '0x2222222222222222222222222222222222222222'
const DELAY = '0x3333333333333333333333333333333333333333'
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11'
const TOKEN = '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18'
const CREATOR = '0x3d3972cD5Df10FAa6C085b5ab2F73aEEb5f19aDD'

const dao = new Interface(['function execute(bytes32,(address,uint256,bytes)[],uint256)'])
const safe = new Interface([
  'function execTransactionFromModule(address,uint256,bytes,uint8)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)',
])
const delay = new Interface(['function executeNextTx(address,uint256,bytes,uint8)'])
const multicall = new Interface(['function aggregate3((address,bool,bytes)[])'])
const transfer = DECATS.rawActions[0].data

const execute = (actions: { to: string; value: string; data: string }[]) =>
  dao.encodeFunctionData('execute', ['0x' + '00'.repeat(32), actions.map(a => [a.to, a.value, a.data]), 0])

const ctxFor = (rawActions: any[]) => {
  const base = fakeAssessmentContext()
  const actions = AssessmentContextBuilder._flatten(rawActions, DAO)
  return { ...base, actions }
}

describe('proposalChecks/context nested expansion', () => {
  it('follows a DAO execute into another DAO and attributes the inner transfer to that DAO', () => {
    const actions = AssessmentContextBuilder._flatten(
      [{ to: OTHER_DAO, value: '0', data: execute([{ to: TOKEN, value: '0', data: transfer }]) }],
      DAO,
    )

    expect(actions.map(a => [a.path, a.depth, a.caller, a.target, a.via, a.nested])).to.deep.eq([
      ['0', 0, DAO, OTHER_DAO, null, 'expanded'],
      ['0/0', 1, OTHER_DAO, TOKEN, 'execute', null],
    ])
    expect(actions[1].decoded?.name).to.eq('transfer')

    const findings = TransfersCheck.run(
      ctxFor([{ to: OTHER_DAO, value: '0', data: execute([{ to: TOKEN, value: '0', data: transfer }]) }]),
    ).findings
    expect(findings.map(f => f.id)).to.deep.eq(['assets/transfers:erc20:0/0'])
    expect((findings[0].after as any).from).to.eq(OTHER_DAO)
  })

  it('follows a Safe module transaction and marks a delegatecall as such', () => {
    const data = safe.encodeFunctionData('execTransactionFromModule', [TOKEN, 0, transfer, 1])
    const [outer, inner] = AssessmentContextBuilder._flatten([{ to: SAFE, value: '0', data }], DAO)

    expect(outer.nested).to.eq('expanded')
    expect(inner).to.include({
      path: '0/0',
      caller: SAFE,
      target: TOKEN,
      via: 'execTransactionFromModule',
      operation: 'delegatecall',
    })
  })

  it('keeps the Safe as the executing account below a delegatecalled Multicall', () => {
    const batch = multicall.encodeFunctionData('aggregate3', [[[TOKEN, false, transfer]]])
    const data = safe.encodeFunctionData('execTransactionFromModule', [MULTICALL, 0, batch, 1])
    const actions = AssessmentContextBuilder._flatten([{ to: SAFE, value: '0', data }], DAO)

    expect(actions.map(a => [a.path, a.caller, a.operation])).to.deep.eq([
      ['0', DAO, 'call'],
      ['0/0', SAFE, 'delegatecall'],
      ['0/0/0', SAFE, 'call'],
    ])
    const findings = TransfersCheck.run({ ...fakeAssessmentContext(), actions }).findings
    expect(findings.map(f => [f.id, (f.after as any).from])).to.deep.eq([['assets/transfers:erc20:0/0/0', SAFE]])
  })

  it('follows a Safe execTransaction and a Delay executeNextTx', () => {
    const viaSafe = safe.encodeFunctionData('execTransaction', [
      CREATOR,
      '1000',
      '0x',
      0,
      0,
      0,
      0,
      '0x' + '00'.repeat(20),
      '0x' + '00'.repeat(20),
      '0x',
    ])
    const viaDelay = delay.encodeFunctionData('executeNextTx', [TOKEN, 0, transfer, 0])
    const actions = AssessmentContextBuilder._flatten(
      [
        { to: SAFE, value: '0', data: viaSafe },
        { to: DELAY, value: '0', data: viaDelay },
      ],
      DAO,
    )

    expect(actions.map(a => [a.path, a.via])).to.deep.eq([
      ['0', null],
      ['0/0', 'execTransaction'],
      ['1', null],
      ['1/0', 'executeNextTx'],
    ])
    expect(actions[1]).to.include({ target: CREATOR, value: '1000', decoding: 'empty', caller: SAFE })
    // The Delay forwards to its avatar, which is not known without reading the module: unresolved, not the module itself.
    expect(actions[3]).to.include({ caller: null, target: TOKEN, via: 'executeNextTx' })
  })

  it('follows a Zodiac Roles call into its target with the executing account unknown, as with the Delay', () => {
    const actions = AssessmentContextBuilder._flatten(TERM_META_VAULT.rawActions, TERM_META_VAULT.daoAddress)
    const inner = actions.find(a => a.path === '0/0')!

    expect(actions[0]).to.deep.include({ path: '0', nested: 'expanded', caller: TERM_META_VAULT.daoAddress })
    expect(inner).to.deep.include({
      target: TERM_META_VAULT.rawActions[3].to,
      caller: null,
      via: 'callTargetFunctionWithRole',
    })
    expect(inner.decoded?.name).to.eq('setTxCooldown')
    expect(actions.filter(a => a.via === 'executeNextTx').every(a => a.caller === null)).to.be.true
  })

  it('follows a Multicall3 aggregate3 into each call', () => {
    const data = multicall.encodeFunctionData('aggregate3', [
      [
        [TOKEN, false, transfer],
        [TOKEN, true, transfer],
      ],
    ])
    const actions = AssessmentContextBuilder._flatten([{ to: MULTICALL, value: '0', data }], DAO)

    expect(actions.map(a => a.path)).to.deep.eq(['0', '0/0', '0/1'])
    expect(
      actions.slice(1).every(a => a.caller === MULTICALL && a.via === 'aggregate3' && a.decoded?.name === 'transfer'),
    ).to.eq(true)
  })

  it('stops at the depth limit and says so instead of following forever', () => {
    let data = transfer
    let to = TOKEN
    for (let i = 0; i < MAX_NESTED_DEPTH + 2; i++) {
      data = execute([{ to, value: '0', data }])
      to = OTHER_DAO
    }
    const actions = AssessmentContextBuilder._flatten([{ to, value: '0', data }], DAO)

    const deepest = actions[actions.length - 1]
    expect(deepest.depth).to.eq(MAX_NESTED_DEPTH - 1)
    expect(deepest.nested).to.eq('truncated')
    expect(actions.some(a => a.decoded?.name === 'transfer')).to.eq(false)
  })

  it('marks a wrapper whose calldata does not fit as unreadable', () => {
    const selector = execute([]).slice(0, 10)
    const actions = AssessmentContextBuilder._flatten([{ to: OTHER_DAO, value: '0', data: `${selector}deadbeef` }], DAO)

    expect(actions).to.have.length(1)
    expect(actions[0].nested).to.eq('unreadable')
    expect(actions[0].decoding).to.eq('unknown')
  })

  it('reports actions as fully read only when every wrapper was followed', async () => {
    const resolve = sinon.stub(AbiResolver, 'resolve').resolves()
    const recipients = sinon.stub(RecipientResolver, 'resolve').resolves({})
    const request: any = { ...fakeAssessmentContext().request, captured: null }
    await seedRequestOwners(request)
    const captured = (rawActions: any[]) => ({ ...fakeAssessmentContext().captured, rawActions })
    const readable = await AssessmentContextBuilder.build({
      ...request,
      captured: captured([{ to: OTHER_DAO, value: '0', data: execute([{ to: TOKEN, value: '0', data: transfer }]) }]),
    })
    const cutOff = await AssessmentContextBuilder.build({
      ...request,
      captured: captured([{ to: OTHER_DAO, value: '0', data: `${execute([]).slice(0, 10)}00` }]),
    })

    expect(readable.actions.every(a => a.nested === null || a.nested === 'expanded')).to.eq(true)
    expect(cutOff.actions.some(a => a.nested === 'unreadable')).to.eq(true)
    resolve.restore()
    recipients.restore()
  })
})

describe('proposalChecks/checks/execution/nested', () => {
  it('is ok when every wrapper was followed, and leaves the inner calls to the other rules', () => {
    const result = NestedCheck.run(
      ctxFor([{ to: OTHER_DAO, value: '0', data: execute([{ to: TOKEN, value: '0', data: transfer }]) }]),
    )

    expect(result).to.deep.eq({ status: IAssessmentCheckStatus.Ok, findings: [] })
  })

  it('needs review when a wrapper could not be read or was cut off, naming the paths', () => {
    let deep = transfer
    for (let i = 0; i < MAX_NESTED_DEPTH + 1; i++) deep = execute([{ to: OTHER_DAO, value: '0', data: deep }])
    const result = NestedCheck.run(
      ctxFor([
        { to: OTHER_DAO, value: '0', data: `${execute([]).slice(0, 10)}00` },
        { to: OTHER_DAO, value: '0', data: deep },
      ]),
    )

    expect(result.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(result.reason).to.contain('could not be read at 0')
    expect(result.reason).to.contain('depth limit were not followed at 1/0/0/0')
  })

  it('is not applicable to a signalling proposal', () => {
    expect(NestedCheck.run(ctxFor([])).status).to.eq(IAssessmentCheckStatus.NotApplicable)
  })
})
