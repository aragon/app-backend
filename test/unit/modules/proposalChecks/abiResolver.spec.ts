import { DAO } from '@artifacts/dao'
import ContractHelper from '@helpers/contractHelper'
import ProxyContract from '@helpers/proxyContract'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import AbiResolver from '@modules/proposalChecks/abiResolver'
import DecodeCheck from '@modules/proposalChecks/checks/execution/decode'
import DelegatecallCheck from '@modules/proposalChecks/checks/execution/delegatecall'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import ProviderModule from '@modules/provider'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { AUDIOVISUAL, DECATS } from '@test/mock/proposalChecks/incidents'
import { IAssessmentCheckStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const daoSource = [{ SourceCode: '', ABI: JSON.stringify(DAO.abi), ContractName: 'DAO', CompilerVersion: '' }]
const BLOCK = 91272887
const ZERO_WORD = `0x${'00'.repeat(32)}`
const asWord = (address: string) => `0x${'00'.repeat(12)}${address.slice(2).toLowerCase()}`
// A DAO function the checks have no built-in signature for, so only the verified source can decode it.
const setMetadata = {
  to: AUDIOVISUAL.daoAddress,
  value: '0',
  data: new Interface(DAO.abi).encodeFunctionData('setMetadata', ['0x1234']),
}
// The attacker contract's own function: no source anywhere.
const attackerCall = AUDIOVISUAL.rawActions[1]

describe('proposalChecks/abiResolver', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('decodes a DAO call through the implementation the proxy had at the evidence block', async () => {
    const impl = '0x1234567890123456789012345678901234567890'
    const getStorage = sandbox.stub().resolves(asWord(impl))
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage })
    const latest = sandbox.stub(ProxyContract, 'getImplementationAddress')
    const source = sandbox.stub(ContractHelper, 'getSourceCode').resolves(daoSource as any)
    const actions = AssessmentContextBuilder._flatten([setMetadata], AUDIOVISUAL.daoAddress)
    expect(actions[0].decoding).to.eq('unknown')

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(getStorage.args[0][2]).to.eq(BLOCK)
    expect(latest.called).to.be.false
    expect(source.calledWith(impl, NetworksEnum.polygonMainnet)).to.be.true
    expect(actions[0].decoding).to.eq('known')
    expect(actions[0].decoded?.name).to.eq('setMetadata')
    expect(actions[0].decoded?.args._metadata).to.eq('0x1234')
    expect(actions[0].abi).to.deep.eq({
      source: 'verified',
      contractName: 'DAO',
      implementation: impl,
      blockPinned: true,
    })
  })

  it('falls back to the current implementation and says the ABI was not pinned when the block read gives nothing', async () => {
    const impl = '0x1234567890123456789012345678901234567890'
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage: sandbox.stub().resolves(ZERO_WORD) })
    sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(impl)
    sandbox.stub(ContractHelper, 'getSourceCode').resolves(daoSource as any)
    const actions = AssessmentContextBuilder._flatten([setMetadata], AUDIOVISUAL.daoAddress)

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(actions[0].decoding).to.eq('known')
    expect(actions[0].abi?.blockPinned).to.eq(false)
    const base = fakeAssessmentContext()
    const ctx = {
      ...base,
      actions,
      captured: { ...base.captured, evidenceBlock: { ...base.captured.evidenceBlock, number: BLOCK } },
    }
    const result = DecodeCheck.run(ctx)
    expect(result.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(result.reason).to.contain(`ABI for 0 read from the current implementation, not at block ${BLOCK}`)
  })

  it('never calls a fallback resolution pinned, even when it finds no proxy at all', async () => {
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage: sandbox.stub().resolves(ZERO_WORD) })
    sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
    sandbox.stub(ContractHelper, 'getSourceCode').resolves(daoSource as any)
    const actions = AssessmentContextBuilder._flatten([setMetadata], AUDIOVISUAL.daoAddress)

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(actions[0].decoding).to.eq('known')
    expect(actions[0].abi?.blockPinned).to.eq(false)
  })

  it('leaves a call undecoded when the target has no verified source, and looks each target up once', async () => {
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage: sandbox.stub().resolves(ZERO_WORD) })
    sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
    const source = sandbox.stub(ContractHelper, 'getSourceCode').resolves(null)
    const actions = AssessmentContextBuilder._flatten([setMetadata, attackerCall, attackerCall], AUDIOVISUAL.daoAddress)

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(actions.map(a => a.decoding)).to.deep.eq(['unknown', 'unknown', 'unknown'])
    expect(actions.every(a => a.abi === null)).to.eq(true)
    expect(source.callCount).to.eq(2)
  })

  it('leaves a call undecoded when the verified source has no function for it', async () => {
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage: sandbox.stub().resolves(ZERO_WORD) })
    sandbox.stub(ProxyContract, 'getImplementationAddress').resolves(null)
    sandbox.stub(ContractHelper, 'getSourceCode').resolves(daoSource as any)
    const actions = AssessmentContextBuilder._flatten([attackerCall], AUDIOVISUAL.daoAddress)

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(actions[0].decoding).to.eq('unknown')
  })

  it('keeps going when the lookup itself fails, without decoding anything from it', async () => {
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').throws(new Error('no provider'))
    sandbox.stub(logger, 'warn')
    const actions = AssessmentContextBuilder._flatten([setMetadata, attackerCall], AUDIOVISUAL.daoAddress)

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(actions.every(a => a.decoding === 'unknown')).to.eq(true)
  })

  it('does not look anything up for calls the built-in signatures already decoded, the DAO grant included', async () => {
    const lookup = sandbox.stub(ProviderModule, 'getAnyRpcProvider')
    const actions = AssessmentContextBuilder._flatten(
      [...DECATS.rawActions, AUDIOVISUAL.rawActions[0]],
      DECATS.daoAddress,
    )

    await AbiResolver.resolve(actions, NetworksEnum.polygonMainnet, BLOCK)

    expect(lookup.called).to.be.false
    expect(actions.map(a => a.decoded?.name)).to.deep.eq(['transfer', 'grant'])
    expect(actions[0].abi).to.deep.eq({
      source: 'builtin',
      contractName: null,
      implementation: null,
      blockPinned: true,
    })
  })

  it("decodes from the proxy's own source when the implementation's ABI does not carry the function", async () => {
    const impl = '0x1234567890123456789012345678901234567890'
    const strategy = AUDIOVISUAL.daoAddress
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getStorage: sandbox.stub().resolves(asWord(impl)) })
    const source = sandbox.stub(ContractHelper, 'getSourceCode')
    // A strategy proxy: the slot names a standard implementation, the strategy's own functions stay on the proxy.
    source
      .withArgs(impl as any, AUDIOVISUAL.network)
      .resolves([{ ABI: JSON.stringify(['function report()']), ContractName: 'TokenizedStrategy' }] as any)
    source
      .withArgs(strategy, AUDIOVISUAL.network)
      .resolves([{ ABI: JSON.stringify(['function setTermController(address)']), ContractName: 'TermStrategy' }] as any)
    const actions = AssessmentContextBuilder._flatten(
      [
        {
          to: strategy,
          value: '0',
          data: new Interface(['function setTermController(address)']).encodeFunctionData('setTermController', [impl]),
        },
      ],
      AUDIOVISUAL.daoAddress,
    )

    await AbiResolver.resolve(actions, AUDIOVISUAL.network, BLOCK)

    expect(actions[0].decoded?.name).to.eq('setTermController')
    expect(actions[0].abi).to.deep.include({ source: 'verified', contractName: 'TermStrategy', implementation: null })
  })
})

describe('proposalChecks/checks/execution/decode', () => {
  const ctxWith = (rawActions: any[], dao = DECATS.daoAddress) => ({
    ...fakeAssessmentContext(),
    actions: AssessmentContextBuilder._flatten(rawActions, dao),
  })

  it('is ok when every call with calldata was decoded', () => {
    expect(DecodeCheck.run(ctxWith(DECATS.rawActions))).to.deep.eq({ status: IAssessmentCheckStatus.Ok, findings: [] })
  })

  it('needs review naming each undecoded call by path, selector and target, and only those', () => {
    const result = DecodeCheck.run(ctxWith(AUDIOVISUAL.rawActions, AUDIOVISUAL.daoAddress))

    expect(result.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(result.reason).to.contain('1 (0x9f795bfb on 0xb2d8b29b73dB386943D74e5Db57e8C044C7c2DB1)')
    expect(result.reason).to.not.contain('0xd68bad2c')
  })

  it('treats a plain value transfer as decoded and a signalling proposal as not applicable', () => {
    expect(DecodeCheck.run(ctxWith([{ to: DECATS.creatorAddress, value: '1', data: '0x' }])).status).to.eq(
      IAssessmentCheckStatus.Ok,
    )
    expect(DecodeCheck.run(ctxWith([])).status).to.eq(IAssessmentCheckStatus.NotApplicable)
  })
})

describe('proposalChecks/checks/execution/delegatecall', () => {
  it('is ok when nothing is delegatecalled and needs review naming each delegatecall otherwise', () => {
    const base = {
      ...fakeAssessmentContext(),
      actions: AssessmentContextBuilder._flatten(DECATS.rawActions, DECATS.daoAddress),
    }
    expect(DelegatecallCheck.run(base).status).to.eq(IAssessmentCheckStatus.Ok)

    const delegated = { ...base, actions: base.actions.map(a => ({ ...a, operation: 'delegatecall' as const })) }
    const result = DelegatecallCheck.run(delegated)
    expect(result.status).to.eq(IAssessmentCheckStatus.NeedsReview)
    expect(result.reason).to.contain(`0 (0x198f1D316aad1C0Bfd36a79bd1A8e9dba92DAa18 as ${DECATS.daoAddress})`)

    expect(DelegatecallCheck.run({ ...base, actions: [] }).status).to.eq(IAssessmentCheckStatus.NotApplicable)
  })
})
