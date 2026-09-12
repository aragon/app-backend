import AssessmentContextBuilder from '@modules/proposalChecks/context'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import { IMPLEMENTED_CHECKS } from '@modules/proposalChecks/checks/index'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { AUDIOVISUAL, BLOCKPEDIA, DECATS, FARTDAO, type IIncidentFixture } from '@test/mock/proposalChecks/incidents'
import { IAssessmentCheckStatus, IAssessmentFindingKind } from '@types'
import { expect } from 'chai'

const contextOf = (incident: IIncidentFixture) => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: {
      ...base.request,
      daoAddress: incident.daoAddress,
      pluginAddress: incident.pluginAddress,
      network: incident.network,
    },
    captured: { ...base.captured, rawActions: incident.rawActions },
    actions: AssessmentContextBuilder._flatten(incident.rawActions, incident.daoAddress),
    availability: { actions: 'partial' as const, simulation: 'unsupported' as const, recipients: 'missing' as const },
  }
}

const DECATS_TOKEN = '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18'

describe('proposalChecks/checks/assets/transfers', () => {
  it('reports the DeCats drain: one token transfer of 1369 DECATS to the creator', () => {
    const result = TransfersCheck.run(contextOf(DECATS))

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings).to.have.length(1)
    const [finding] = result.findings
    expect(finding.id).to.eq('assets/transfers:erc20:0')
    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect(finding.notify).to.eq(true)
    expect(finding.actionPaths).to.deep.eq(['0'])
    expect(finding.after).to.deep.eq({
      asset: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
      from: DECATS.daoAddress,
      to: DECATS.creatorAddress,
      amount: '1369000000000000000000',
      confirmed: null,
      recipient: null,
      valuation: { usd: null, treasuryShare: null, pricedAt: 0 },
    })
  })

  it('reports the FartDao drain: native coin plus a token transfer, both to the creator', () => {
    const result = TransfersCheck.run(contextOf(FARTDAO))

    expect(result.findings.map(f => f.id)).to.deep.eq(['assets/transfers:native:0', 'assets/transfers:erc20:1'])
    expect(result.findings[0].after).to.deep.eq({
      asset: 'native',
      from: FARTDAO.daoAddress,
      to: FARTDAO.creatorAddress,
      amount: '89600000000000000',
      confirmed: null,
      recipient: null,
      valuation: { usd: null, treasuryShare: null, pricedAt: 0 },
    })
    expect((result.findings[1].after as any).to).to.eq(FARTDAO.creatorAddress)
    expect((result.findings[1].after as any).amount).to.eq('13264000000000')
  })

  it('reports the Blockpedia drain with the hashed proposal index left alone', () => {
    const result = TransfersCheck.run(contextOf(BLOCKPEDIA))

    expect(result.findings.map(f => f.id)).to.deep.eq(['assets/transfers:native:0', 'assets/transfers:erc20:1'])
    expect(result.findings.every(f => (f.after as any).to === BLOCKPEDIA.creatorAddress)).to.eq(true)
    expect((result.findings[1].after as any).amount).to.eq('57508967000000000000000000')
  })

  it('stays quiet on the Audiovisual Advance mint grab, where no value moves', () => {
    const result = TransfersCheck.run(contextOf(AUDIOVISUAL))

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings).to.deep.eq([])
  })

  it('is not applicable to a signalling proposal', () => {
    const ctx = { ...contextOf(DECATS), actions: [] }

    const result = TransfersCheck.run(ctx)

    expect(result.status).to.eq(IAssessmentCheckStatus.NotApplicable)
    expect(result.reason).to.eq('proposal has no actions')
  })

  it('names what it could not verify while simulation and recipients are missing', () => {
    const [finding] = TransfersCheck.run(contextOf(DECATS)).findings

    expect(finding.evidenceLimit).to.eq(
      'amount not priced; not confirmed by simulation; recipient not resolved; nested calls not expanded',
    )
  })

  it('confirms a requested transfer against the simulated movements, and says when none matches', () => {
    const ctx = contextOf(DECATS)
    const simulated = {
      ...ctx,
      availability: { ...ctx.availability, simulation: 'ok' as const },
      simulation: {
        ...ctx.simulation,
        status: 'ok' as const,
        reason: null,
        movements: [
          {
            type: 'Transfer',
            standard: 'ERC20' as const,
            asset: DECATS_TOKEN,
            from: DECATS.daoAddress,
            to: DECATS.creatorAddress,
            amount: '1369000000000000000000',
          },
        ],
      },
    }

    const [confirmed] = TransfersCheck.run(simulated).findings
    expect((confirmed.after as any).confirmed).to.eq(true)
    expect(confirmed.evidenceLimit).to.not.contain('simulation')

    const mismatch = { ...simulated, simulation: { ...simulated.simulation, movements: [] } }
    const [unconfirmed] = TransfersCheck.run(mismatch).findings
    expect((unconfirmed.after as any).confirmed).to.eq(false)
    expect(unconfirmed.details).to.include('the simulation predicts no such movement')
  })

  it('reports a simulated treasury movement no decoded action asked for, for a person, with its recipient and value', () => {
    const ctx = contextOf(DECATS)
    const withRouter = {
      ...ctx,
      actions: AssessmentContextBuilder._flatten(
        [{ to: '0x9999999999999999999999999999999999999999', value: '0', data: '0xdeadbeef' }],
        DECATS.daoAddress,
      ),
      availability: { ...ctx.availability, simulation: 'ok' as const },
      simulation: {
        ...ctx.simulation,
        status: 'ok' as const,
        reason: null,
        movements: [
          {
            type: 'Transfer',
            standard: 'ERC20' as const,
            asset: DECATS_TOKEN,
            from: DECATS.daoAddress,
            to: DECATS.creatorAddress,
            amount: '5',
          },
          {
            type: 'Transfer',
            standard: 'ERC20' as const,
            asset: DECATS_TOKEN,
            from: DECATS.creatorAddress,
            to: DECATS.daoAddress,
            amount: '1',
          },
        ],
      },
    }

    const { findings } = TransfersCheck.run(withRouter)

    expect(findings.map(f => f.id)).to.deep.eq(['assets/transfers:simulated:0'])
    expect(findings[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(findings[0].notify).to.be.true
    expect(findings[0].title).to.contain('through a call that could not be read')
    expect(findings[0].details[0]).to.contain('the call producing it could not be read')
  })

  it('leaves a verified function named transfer but shaped otherwise for a person', () => {
    const ctx = contextOf(DECATS)
    const odd = {
      ...ctx,
      actions: ctx.actions.map(a => ({
        ...a,
        decoded: { signature: 'transfer(uint256)', name: 'transfer', args: { amount: '5' } },
        abi: { source: 'verified' as const, contractName: 'Odd', implementation: null, blockPinned: true },
      })),
    }

    const [finding] = TransfersCheck.run(odd).findings

    expect(finding.id).to.eq('assets/transfers:unfamiliar:0')
    expect(finding.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(finding.title).to.contain('transfer(uint256)')
  })

  it("does not let a movement from another account confirm the DAO's transfer", () => {
    const ctx = contextOf(DECATS)
    const simulated = {
      ...ctx,
      availability: { ...ctx.availability, simulation: 'ok' as const },
      simulation: {
        ...ctx.simulation,
        status: 'ok' as const,
        reason: null,
        movements: [
          {
            type: 'Transfer',
            standard: 'ERC20' as const,
            asset: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
            from: '0x9999999999999999999999999999999999999999',
            to: DECATS.creatorAddress,
            amount: '1369000000000000000000',
          },
        ],
      },
    }

    const [finding] = TransfersCheck.run(simulated).findings

    expect((finding.after as any).confirmed).to.eq(false)
  })

  it('needs one predicted movement per requested transfer, so a repeated transfer is not confirmed twice by one', () => {
    const ctx = contextOf({ ...DECATS, rawActions: [DECATS.rawActions[0], DECATS.rawActions[0]] })
    const movement = {
      type: 'Transfer',
      standard: 'ERC20' as const,
      asset: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
      from: DECATS.daoAddress,
      to: DECATS.creatorAddress,
      amount: '1369000000000000000000',
    }
    const once = {
      ...ctx,
      availability: { ...ctx.availability, simulation: 'ok' as const },
      simulation: { ...ctx.simulation, status: 'ok' as const, reason: null, movements: [movement] },
    }

    const findings = TransfersCheck.run(once).findings

    expect(findings.map(f => (f.after as any).confirmed)).to.deep.eq([true, false])
    const twice = { ...once, simulation: { ...once.simulation, movements: [movement, movement] } }
    expect(TransfersCheck.run(twice).findings.map(f => (f.after as any).confirmed)).to.deep.eq([true, true])
  })

  it('labels a transfer large at a hundred thousand dollars or a tenth of the priced treasury, never when unpriced', () => {
    const base = contextOf(DECATS)
    const holding = (balance: string, priceUsd: string | null) => ({
      ...base,
      treasury: {
        pricedAt: 1,
        totalUsd: priceUsd ? '100000000000' : null,
        assets: { [DECATS_TOKEN]: { balance, decimals: 18, priceUsd } },
      },
    })

    const byDollars = TransfersCheck.run(holding('1000000000', '100')).findings[0]
    expect(byDollars.labels).to.deep.eq(['large'])
    expect((byDollars.after as any).valuation.usd).to.eq('136900')

    const small = TransfersCheck.run(holding('1000000000', '0.001')).findings[0]
    expect(small.labels).to.deep.eq([])

    const unpriced = TransfersCheck.run(holding('2000', null)).findings[0]
    expect(unpriced.labels).to.deep.eq([])
    expect(unpriced.evidenceLimit).to.contain('amount not priced')

    const byShare = TransfersCheck.run({
      ...holding('1000000000', '0.001'),
      treasury: { ...holding('1000000000', '0.001').treasury, totalUsd: '10' },
    }).findings[0]
    expect(byShare.labels).to.deep.eq(['large'])
  })

  it('carries the revert reason as an evidence limit when the simulation reverted', () => {
    const ctx = contextOf(DECATS)
    const reverted = {
      ...ctx,
      simulation: { ...ctx.simulation, status: 'reverted' as const, reason: 'DaoUnauthorized' },
    }

    const [finding] = TransfersCheck.run(reverted).findings

    expect((finding.after as any).confirmed).to.eq(null)
    expect(finding.evidenceLimit).to.contain('simulation reverted: DaoUnauthorized')
  })

  it('drops the evidence limit once every input it needs is there', () => {
    const base = contextOf(DECATS)
    const key = DECATS.creatorAddress
    const ctx = {
      ...base,
      availability: { actions: 'ok' as const, simulation: 'ok' as const, recipients: 'ok' as const },
      simulation: { ...base.simulation, status: 'ok' as const, reason: null },
      recipients: {
        [key]: {
          address: key,
          kind: 'eoa' as const,
          verified: null,
          contractName: null,
          deployedAtBlock: null,
          deployedAt: null,
          deployer: null,
          deployedByCreator: null,
          recentlyDeployed: null,
        },
      },
      treasury: {
        pricedAt: 1,
        totalUsd: '5000',
        assets: {
          [DECATS_TOKEN]: {
            balance: '10000',
            decimals: 18,
            priceUsd: '0.5',
          },
        },
      },
    }

    const [finding] = TransfersCheck.run(ctx).findings

    expect(finding.evidenceLimit).to.eq(undefined)
    expect((finding.after as any).valuation).to.deep.eq({ usd: '684.5', treasuryShare: '0.1369', pricedAt: 1 })
    expect(finding.details).to.include('about $684.50, 13.69% of the treasury holding')
    expect(finding.labels).to.deep.eq(['large'])
  })

  it('reads nothing as a transfer from a delegatecall, even with value and token calldata', () => {
    const ctx = contextOf(DECATS)
    ctx.actions = ctx.actions.map(a => ({ ...a, operation: 'delegatecall' as const, value: '100' }))

    const result = TransfersCheck.run(ctx)

    expect(result.status).to.eq(IAssessmentCheckStatus.Ok)
    expect(result.findings).to.deep.eq([])
  })

  it('reports a transfer whose executing account is unresolved without inventing a sender', () => {
    const ctx = contextOf(DECATS)
    ctx.actions = ctx.actions.map(a => ({ ...a, caller: null, via: 'executeNextTx' as const }))

    const [finding] = TransfersCheck.run(ctx).findings

    expect((finding.after as any).from).to.eq('unresolved')
    expect(finding.details[1]).to.contain('could not be resolved')
  })

  it("says when a transferFrom moves someone else's tokens rather than the DAO's", () => {
    const transferFrom = {
      to: '0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18',
      value: '0',
      data: '0x23b872dd000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000003d3972cd5df10faa6c085b5ab2f73aeeb5f19add0000000000000000000000000000000000000000000000000000000000000001',
    }
    const ctx = contextOf({ ...DECATS, rawActions: [transferFrom] })

    const [finding] = TransfersCheck.run(ctx).findings

    expect((finding.after as any).from).to.eq('0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa')
    expect(finding.details[1]).to.contain('not from the DAO itself')
  })

  it('is listed among the implemented checks', () => {
    expect(IMPLEMENTED_CHECKS.map(c => c.id)).to.include('assets/transfers')
  })
})
