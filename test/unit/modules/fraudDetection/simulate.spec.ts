import TenderlyModule from '@modules/tenderly'
import { simulateExecution } from '@modules/fraudDetection/simulate'
import { ISimulationStatus, NetworksEnum } from '@types'
import { fakeApprovalLog, fakeSimulationResult, TERM_SHAPES } from '@test/mock/fakeTenderlySimulation'
import * as sinon from 'sinon'
import { expect } from 'chai'

const DAO = '0x0d149C53e588B6337965a78C2Dc5D7052f87bC44'
const PLUGIN = '0x57A0ccdC3f58185E14b0135462856fFb6cBeA7a7'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const run = (blockNumber?: number) =>
  simulateExecution({
    actions: [{ to: DAO, value: '0', data: '0x12345678' }],
    daoAddress: DAO,
    pluginAddress: PLUGIN,
    proposalId: 'proposal-1',
    network: NetworksEnum.ethereumMainnet,
    blockNumber,
  })

describe('simulateExecution', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(TenderlyModule, 'isConfigured').returns(true)
  })

  afterEach(() => sandbox.restore())

  it('reads the money that moved', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(TERM_SHAPES.directDrain())

    const facts = await run()

    expect(facts.status).to.equal('confirmed')
    expect(facts.movements).to.have.length(1)
    expect(facts.movements[0].symbol).to.equal('WETH')
    expect(facts.movements[0].amount).to.equal('7351900000000000000')
    expect(facts.movements[0].usd).to.equal(25000)
  })

  it('reads an approval even though nothing moved', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(TERM_SHAPES.delayedDrain())

    const facts = await run()

    expect(facts.movements).to.be.empty
    expect(facts.approvals).to.have.length(1)
    expect(facts.approvals[0].spender.toLowerCase()).to.equal('0xf4450c79d1397df4432ebc548eb6b8350697fa58')
    expect(facts.approvals[0].isUnlimited).to.be.true
  })

  it('matches approvals on the raw topic, not on a decoded event name', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(
      fakeSimulationResult({
        logs: [fakeApprovalLog({ token: WETH, owner: DAO, spender: '0x1111111111111111111111111111111111111111' })],
      }),
    )

    const facts = await run()

    expect(facts.approvals).to.have.length(1)
  })

  it('flattens the call trace so a call behind a Safe module is still visible', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(TERM_SHAPES.controlHandover())

    const facts = await run()

    expect(facts.calls.map(c => c.functionName)).to.include('setPendingGovernor')
    expect(facts.calls.find(c => c.functionName === 'setPendingGovernor')?.depth).to.equal(1)
  })

  it('ignores trace nodes with no real target', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(
      fakeSimulationResult({
        callTrace: {
          from: PLUGIN,
          to: DAO,
          calls: [
            { from: DAO, to: '0x0000000000000000000000000000000000000000' },
            { from: DAO, to: '0x0000000000000000000000000000000000000000' },
            { from: DAO, to: '0x35C99CF4a5DF2D9bCd822BeE32676D9590229e33' },
          ],
        },
      }),
    )

    const facts = await run()

    expect(facts.calls.map(c => c.to)).to.deep.equal([DAO, '0x35C99CF4a5DF2D9bCd822BeE32676D9590229e33'])
  })

  it('pins the simulation to the proposal block', async () => {
    const stub = sandbox.stub(TenderlyModule, 'simulateFull').resolves(TERM_SHAPES.directDrain())

    await run(25_772_694)

    expect(stub.firstCall.args[0].blockNumber).to.equal(25_772_694)
  })

  it('reports a clean run that did nothing as noEffect, not as confirmed', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').resolves(fakeSimulationResult())

    const facts = await run()

    expect(facts.status).to.equal('noEffect')
  })

  it('reports a revert without losing what it saw', async () => {
    sandbox
      .stub(TenderlyModule, 'simulateFull')
      .resolves(fakeSimulationResult({ status: ISimulationStatus.FAILED, error: 'execution reverted' }))

    const facts = await run()

    expect(facts.status).to.equal('reverted')
    expect(facts.error).to.equal('execution reverted')
  })

  it('degrades to unconfirmed when Tenderly is not configured', async () => {
    sandbox.restore()
    sandbox = sinon.createSandbox()
    sandbox.stub(TenderlyModule, 'isConfigured').returns(false)

    const facts = await run()

    expect(facts.status).to.equal('unconfirmed')
    expect(facts.movements).to.be.empty
  })

  it('degrades to unconfirmed when Tenderly throws', async () => {
    sandbox.stub(TenderlyModule, 'simulateFull').rejects(new Error('timeout'))

    const facts = await run()

    expect(facts.status).to.equal('unconfirmed')
    expect(facts.error).to.equal('timeout')
  })
})
