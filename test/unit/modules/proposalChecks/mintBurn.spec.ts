import MintBurnCheck from '@modules/proposalChecks/checks/assets/mintBurn'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import RecipientResolver from '@modules/proposalChecks/recipients'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { AUDIOVISUAL } from '@test/mock/proposalChecks/incidents'
import { IAssessmentFindingKind, type ISimulatedMovement } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const AVA = '0x46122a25470728244fb45fe3955f965e6ccf8fb8'
const BENEFICIARY = '0x1e86EA1Ed84dFfcA463C40BB4FA07e06379DD7c0'
const DAO = AUDIOVISUAL.daoAddress
const token = new Interface([
  'function mint(address,uint256)',
  'function burn(uint256)',
  'function burnFrom(address,uint256)',
  'function freezeMinting()',
])
const ctxWith = (
  rawActions: any[],
  simulation: { status?: 'ok'; movements?: ISimulatedMovement[] } = {},
  governance = true,
) => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    captured: { ...base.captured, rawActions, storedSettings: governance ? { tokenAddress: AVA } : {} },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    simulation: {
      ...base.simulation,
      status: simulation.status ?? ('unsupported' as const),
      reason: null,
      movements: simulation.movements ?? [],
    },
  }
}
const mintMovement = (amount = '1000000000000000000000000000'): ISimulatedMovement => ({
  type: 'Mint',
  asset: AVA,
  standard: 'ERC20',
  from: '0x0000000000000000000000000000000000000000',
  to: BENEFICIARY,
  amount,
})

describe('proposalChecks/checks/assets/mintBurn', () => {
  it('reports a decoded mint of the governance token and says the new tokens carry no votes until delegated', () => {
    const ctx = ctxWith([{ to: AVA, value: '0', data: token.encodeFunctionData('mint', [BENEFICIARY, 1000n]) }])

    const [finding] = MintBurnCheck.run(ctx).findings

    expect(finding.id).to.eq('assets/mintBurn:mint:0')
    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect(finding.notify).to.eq(true)
    expect(finding.details).to.include(
      'this is the governance token: the supply grows and the new tokens carry no votes until delegated',
    )
    expect(finding.after).to.include({
      token: AVA,
      kind: 'mint',
      account: BENEFICIARY,
      amount: '1000',
      confirmed: null,
    })
    expect(finding.evidenceLimit).to.contain('delegation behaviour of the token not read')
  })

  it('reports burns, and a freezeMinting call for a person since only its name is read, without the governance line for another token', () => {
    const other = '0x9999999999999999999999999999999999999999'
    const ctx = ctxWith([
      { to: other, value: '0', data: token.encodeFunctionData('burn', [5n]) },
      { to: other, value: '0', data: token.encodeFunctionData('burnFrom', [BENEFICIARY, 6n]) },
      { to: AVA, value: '0', data: token.encodeFunctionData('freezeMinting', []) },
    ])

    const findings = MintBurnCheck.run(ctx).findings

    expect(findings.map(f => f.id)).to.deep.eq([
      'assets/mintBurn:burn:0',
      'assets/mintBurn:burn:1',
      'assets/mintBurn:freeze:2',
    ])
    expect((findings[0].after as any).account).to.eq(DAO)
    expect((findings[1].after as any).account).to.eq(BENEFICIARY)
    expect(findings[0].details.some(d => d.includes('governance token'))).to.eq(false)
    expect(findings[2].title).to.contain('Calls freezeMinting')
    expect(findings[2].kind).to.eq(IAssessmentFindingKind.NeedsReview)
  })

  it('reports the Audiovisual mint the simulation predicts even though the call that does it cannot be decoded', () => {
    const ctx = ctxWith(AUDIOVISUAL.rawActions, { status: 'ok', movements: [mintMovement()] })

    const findings = MintBurnCheck.run(ctx).findings

    expect(findings).to.have.length(1)
    expect(findings[0].id).to.eq('assets/mintBurn:mint:simulated:0')
    expect(findings[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(findings[0].notify).to.eq(true)
    expect(findings[0].details[0]).to.contain('not requested by any decoded action')
    expect(findings[0].details).to.include(
      'this is the governance token: the supply grows and the new tokens carry no votes until delegated',
    )
    expect(findings[0].after as any).to.include({
      account: BENEFICIARY,
      amount: '1000000000000000000000000000',
      confirmed: true,
    })
  })

  it('confirms a decoded mint against the simulation and does not report the same movement twice', () => {
    const ctx = ctxWith([{ to: AVA, value: '0', data: token.encodeFunctionData('mint', [BENEFICIARY, 7n]) }], {
      status: 'ok',
      movements: [mintMovement('7')],
    })

    const findings = MintBurnCheck.run(ctx).findings

    expect(findings.map(f => f.id)).to.deep.eq(['assets/mintBurn:mint:0'])
    expect((findings[0].after as any).confirmed).to.eq(true)
  })

  it('counts a mint recipient as a beneficiary so it gets resolved', () => {
    const actions = AssessmentContextBuilder._flatten(
      [{ to: AVA, value: '0', data: token.encodeFunctionData('mint', [BENEFICIARY, 1n]) }],
      DAO,
    )
    expect(RecipientResolver.beneficiaries(actions)).to.deep.eq([BENEFICIARY])
  })

  it('leaves a verified mint with another signature for a person instead of reading arguments it does not have', () => {
    const base = ctxWith([{ to: AVA, value: '0', data: '0xa0712d68' + '00'.repeat(31) + '05' }])
    const ctx = {
      ...base,
      actions: base.actions.map(a => ({
        ...a,
        decoding: 'known' as const,
        decoded: { signature: 'mint(uint256)', name: 'mint', args: { amount: '5' } },
        abi: { source: 'verified' as const, contractName: 'Token', implementation: null, blockPinned: true },
      })),
    }

    const { findings } = MintBurnCheck.run(ctx)

    expect(findings.map(f => f.id)).to.deep.eq(['assets/mintBurn:unfamiliar:0'])
    expect(findings[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(findings[0].title).to.contain('mint(uint256)')
  })
})
