import { simulationSignals } from '@modules/fraudDetection/simulationSignals'
import type { IFraudRiskContext, IFraudSimulationFacts } from '@types'
import { expect } from 'chai'

const DAO = '0x0d149C53e588B6337965a78C2Dc5D7052f87bC44'
const PLUGIN = '0x57A0ccdC3f58185E14b0135462856fFb6cBeA7a7'
const VAULT = '0x369d94320d06492DE265C025bFaa4Cf513A1845f'
const ATTACKER = '0xcccc640018f8c2b00fa45F456017AD2378Eb3447'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const context = (over: Partial<IFraudRiskContext> = {}): IFraudRiskContext => ({
  actions: [],
  daoAddress: DAO,
  pluginAddress: PLUGIN,
  creatorAddress: ATTACKER,
  blockTimestamp: 1_786_944_335,
  priorProposals: 0,
  priorVotes: 0,
  isSubPlugin: false,
  daoAssetCount: 1,
  systemAddresses: new Set([DAO, PLUGIN]),
  tokenHolders: new Set<string>(),
  ...over,
})

const facts = (over: Partial<IFraudSimulationFacts> = {}): IFraudSimulationFacts => ({
  status: 'confirmed',
  shareUrl: null,
  runAt: 0,
  movements: [],
  approvals: [],
  calls: [],
  error: null,
  ...over,
})

const named = (signals: ReturnType<typeof simulationSignals>) => signals.map(s => s.name)
const total = (signals: ReturnType<typeof simulationSignals>) => signals.reduce((sum, s) => sum + s.weight, 0)

describe('simulationSignals', () => {
  describe('movements', () => {
    it('flags value leaving the DAO to someone outside it', () => {
      const signals = simulationSignals(
        facts({
          movements: [
            { type: 'Transfer', from: DAO, to: ATTACKER, token: WETH, symbol: 'WETH', amount: '75', usd: 250_000 },
          ],
        }),
        context(),
      )

      expect(named(signals)).to.include('outsiderOutflow')
      expect(total(signals)).to.equal(40)
    })

    it('scores a small outflow exactly like a large one', () => {
      const small = simulationSignals(
        facts({
          movements: [{ type: 'Transfer', from: DAO, to: ATTACKER, token: WETH, symbol: 'WETH', amount: '1', usd: 2 }],
        }),
        context(),
      )
      const large = simulationSignals(
        facts({
          movements: [
            { type: 'Transfer', from: DAO, to: ATTACKER, token: WETH, symbol: 'WETH', amount: '9999', usd: 9_000_000 },
          ],
        }),
        context(),
      )

      expect(total(small)).to.equal(total(large))
    })

    it('scores nothing when Tenderly could not price the token', () => {
      const signals = simulationSignals(
        facts({
          movements: [{ type: 'Transfer', from: DAO, to: ATTACKER, token: WETH, symbol: null, amount: '5', usd: null }],
        }),
        context(),
      )

      expect(named(signals)).to.include('outsiderOutflow')
    })

    it('ignores value moving between the DAO and its own plugins', () => {
      const signals = simulationSignals(
        facts({
          movements: [{ type: 'Transfer', from: DAO, to: PLUGIN, token: WETH, symbol: 'WETH', amount: '1', usd: 1 }],
        }),
        context(),
      )

      expect(named(signals)).to.be.empty
    })

    it('ignores value going to a governance-token holder', () => {
      const holder = '0x1111111111111111111111111111111111111111'
      const signals = simulationSignals(
        facts({
          movements: [{ type: 'Transfer', from: DAO, to: holder, token: WETH, symbol: 'WETH', amount: '1', usd: 1 }],
        }),
        context({ tokenHolders: new Set([holder]) }),
      )

      expect(named(signals)).to.be.empty
    })
  })

  describe('approvals', () => {
    it('flags spend rights granted to an outsider even though nothing moved', () => {
      const signals = simulationSignals(
        facts({
          approvals: [{ token: WETH, owner: DAO, spender: ATTACKER, amount: '1000', isUnlimited: false }],
        }),
        context(),
      )

      expect(named(signals)).to.deep.equal(['outsiderApproval'])
      expect(total(signals)).to.equal(35)
    })

    it('adds weight for an unlimited allowance', () => {
      const signals = simulationSignals(
        facts({
          approvals: [{ token: WETH, owner: DAO, spender: ATTACKER, amount: '999', isUnlimited: true }],
        }),
        context(),
      )

      expect(named(signals)).to.deep.equal(['outsiderApproval', 'unlimitedApproval'])
      expect(total(signals)).to.equal(50)
    })

    it('ignores an approval to one of the DAO plugins', () => {
      const signals = simulationSignals(
        facts({
          approvals: [{ token: WETH, owner: DAO, spender: PLUGIN, amount: '1', isUnlimited: false }],
        }),
        context(),
      )

      expect(named(signals)).to.be.empty
    })
  })

  describe('calls', () => {
    it('names a governance handover on a contract the DAO does not own', () => {
      const signals = simulationSignals(
        facts({ calls: [{ to: VAULT, functionName: 'setPendingGovernor', depth: 1 }] }),
        context(),
      )

      expect(named(signals)).to.deep.equal(['controlHandover'])
      expect(signals[0].detail).to.contain('setPendingGovernor')
    })

    it('still scores a call it cannot name at all', () => {
      const signals = simulationSignals(facts({ calls: [{ to: VAULT, functionName: null, depth: 1 }] }), context())

      expect(named(signals)).to.deep.equal(['opaqueExternalCall'])
      expect(total(signals)).to.equal(15)
    })

    it('ignores calls that stay inside the DAO', () => {
      const signals = simulationSignals(
        facts({
          calls: [
            { to: DAO, functionName: null, depth: 0 },
            { to: PLUGIN, functionName: 'execute', depth: 1 },
          ],
        }),
        context(),
      )

      expect(named(signals)).to.be.empty
    })
  })

  describe('status', () => {
    it('reports a reverting proposal without treating it as safe', () => {
      const signals = simulationSignals(
        facts({ status: 'reverted', calls: [{ to: VAULT, functionName: null, depth: 1 }], error: 'out of gas' }),
        context(),
      )

      expect(named(signals)).to.include('simulationReverted')
      expect(total(signals)).to.equal(25)
    })

    it('produces nothing when the simulation never ran', () => {
      const signals = simulationSignals(facts({ status: 'unconfirmed', error: 'not configured' }), context())

      expect(signals).to.be.empty
    })
  })

  describe('the Term Finance shapes', () => {
    it('catches the delayed drain that moves nothing during execution', () => {
      const signals = simulationSignals(
        facts({
          approvals: [{ token: WETH, owner: DAO, spender: ATTACKER, amount: '999', isUnlimited: true }],
          calls: [
            { to: VAULT, functionName: 'setDiscountRateAdapter', depth: 1 },
            { to: VAULT, functionName: null, depth: 2 },
          ],
        }),
        context(),
      )

      expect(named(signals)).to.have.members([
        'outsiderApproval',
        'unlimitedApproval',
        'controlHandover',
        'opaqueExternalCall',
      ])
      expect(total(signals)).to.equal(95)
    })

    it('catches a bare setPendingGovernor, which decodes to nothing at all', () => {
      const signals = simulationSignals(
        facts({ calls: [{ to: VAULT, functionName: 'setPendingGovernor', depth: 1 }] }),
        context(),
      )

      expect(total(signals)).to.equal(30)
    })
  })
})
