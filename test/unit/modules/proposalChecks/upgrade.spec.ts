import ContractHelper from '@helpers/contractHelper'
import AbiResolver from '@modules/proposalChecks/abiResolver'
import UpgradeCheck from '@modules/proposalChecks/checks/control/upgrade'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import RecipientResolver from '@modules/proposalChecks/recipients'
import UpgradeFacts from '@modules/proposalChecks/upgrades'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { type IAssessmentContext, IAssessmentFindingKind, type IUpgradeFacts, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface, keccak256 } from 'ethers'
import sinon from 'sinon'

const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const PLUGIN = '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be'
const ADMIN = '0x1111111111111111111111111111111111111111'
const OLD_IMPL = '0x2222222222222222222222222222222222222222'
const NEW_IMPL = '0x3333333333333333333333333333333333333333'
const BLOCK = 123
const uups = new Interface(['function upgradeTo(address)', 'function upgradeToAndCall(address,bytes)'])
const admin = new Interface(['function upgrade(address,address)'])
const erc20 = new Interface(['function transfer(address,uint256)'])

const upgradeTo = (proxy: string, impl: string) => ({
  to: proxy,
  value: '0',
  data: uups.encodeFunctionData('upgradeTo', [impl]),
})
const upgradeAndInit = (proxy: string, impl: string, data: string) => ({
  to: proxy,
  value: '0',
  data: uups.encodeFunctionData('upgradeToAndCall', [impl, data]),
})
const adminUpgrade = (proxy: string, impl: string) => ({
  to: ADMIN,
  value: '0',
  data: admin.encodeFunctionData('upgrade', [proxy, impl]),
})
const transfer = (token: string) => ({ to: token, value: '0', data: erc20.encodeFunctionData('transfer', [ADMIN, 1]) })

const facts = (overrides: Partial<IUpgradeFacts> = {}): IUpgradeFacts => ({
  proxy: DAO,
  currentImplementation: OLD_IMPL,
  currentCodeHash: keccak256('0x6001'),
  proposedImplementation: NEW_IMPL,
  proposedCodeHash: keccak256('0x6002'),
  proposedVerified: true,
  proposedContractName: 'DAO',
  blockPinned: true,
  ...overrides,
})
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    plugins: [{ address: PLUGIN, interfaceType: 'tokenVoting', isSubPlugin: false }],
    ...overrides,
  }
}

describe('proposalChecks/upgrades', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('recognises the UUPS and the ProxyAdmin forms and names the proxy each one replaces code behind', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        upgradeTo(DAO, NEW_IMPL),
        upgradeAndInit(PLUGIN, NEW_IMPL, '0x1234'),
        adminUpgrade(PLUGIN, NEW_IMPL),
        transfer(ADMIN),
      ],
      DAO,
    )
    expect(actions.filter(a => a.depth === 0).map(UpgradeFacts.callOf)).to.deep.eq([
      { proxy: DAO, implementation: NEW_IMPL, data: null },
      { proxy: PLUGIN, implementation: NEW_IMPL, data: '0x1234' },
      { proxy: PLUGIN, implementation: NEW_IMPL, data: null },
      null,
    ])
  })

  it('reads the current implementation at the block and hashes both codes, marking the new one verified from its source', async () => {
    sandbox.stub(AbiResolver, '_implementationAt').resolves({ implementation: OLD_IMPL, blockPinned: true })
    const codeAt = sandbox.stub(RecipientResolver, '_codeAt')
    codeAt.withArgs(OLD_IMPL, NetworksEnum.ethereumMainnet, BLOCK).resolves('0x6001')
    codeAt.withArgs(NEW_IMPL, NetworksEnum.ethereumMainnet, BLOCK).resolves('0x6002')
    sandbox.stub(ContractHelper, 'getSourceCode').resolves([{ ABI: '[]', ContractName: 'DAO' }] as any)
    const actions = AssessmentContextBuilder._flatten([transfer(ADMIN), upgradeTo(DAO, NEW_IMPL)], DAO)

    const loaded = await UpgradeFacts.load(actions, NetworksEnum.ethereumMainnet, BLOCK)

    expect(Object.keys(loaded)).to.deep.eq(['1'])
    expect(loaded['1']).to.deep.eq(facts())
  })

  it('records an implementation with no code at the block as unhashed and unverified, without asking for its source', async () => {
    sandbox.stub(AbiResolver, '_implementationAt').resolves({ implementation: null, blockPinned: false })
    sandbox.stub(RecipientResolver, '_codeAt').resolves('0x')
    const source = sandbox.stub(ContractHelper, 'getSourceCode')
    const actions = AssessmentContextBuilder._flatten([upgradeTo(DAO, NEW_IMPL)], DAO)

    const loaded = await UpgradeFacts.load(actions, NetworksEnum.ethereumMainnet, BLOCK)

    expect(loaded['0']).to.deep.eq(
      facts({
        currentImplementation: null,
        currentCodeHash: null,
        proposedCodeHash: null,
        proposedVerified: null,
        proposedContractName: null,
        blockPinned: false,
      }),
    )
    expect(source.called).to.be.false
  })

  it('leaves an upgrade out of the facts when its lookup fails, so the check reports it as unread', async () => {
    sandbox.stub(AbiResolver, '_implementationAt').rejects(new Error('archive node down'))
    const actions = AssessmentContextBuilder._flatten([upgradeTo(DAO, NEW_IMPL)], DAO)

    expect(await UpgradeFacts.load(actions, NetworksEnum.ethereumMainnet, BLOCK)).to.deep.eq({})
  })
})

describe('proposalChecks/checks/control/upgrade', () => {
  it('reports a verified upgrade as a change with both code hashes, naming the DAO or the plugin', () => {
    const ctx = ctxWith([upgradeTo(DAO, NEW_IMPL), upgradeTo(PLUGIN, NEW_IMPL)], {
      upgrades: { '0': facts(), '1': facts({ proxy: PLUGIN, proposedContractName: 'TokenVoting' }) },
    })

    const { findings } = UpgradeCheck.run(ctx)

    expect(findings.map(f => [f.kind, f.notify, f.title])).to.deep.eq([
      [IAssessmentFindingKind.Change, true, `Upgrades the DAO to DAO at ${NEW_IMPL}`],
      [IAssessmentFindingKind.Change, true, `Upgrades the tokenVoting plugin ${PLUGIN} to TokenVoting at ${NEW_IMPL}`],
    ])
    expect(findings[0].details).to.deep.eq([
      `current implementation ${OLD_IMPL} (code ${keccak256('0x6001').slice(0, 10)})`,
      `new implementation ${NEW_IMPL} (code ${keccak256('0x6002').slice(0, 10)})`,
    ])
    expect(findings[0].evidenceLimit).to.contain('storage layout')
    expect(findings[0].evidenceLimit).to.contain('not simulated')
  })

  it('needs review for unverified code, for code missing at the block, and for an upgrade whose facts could not be read', () => {
    const ctx = ctxWith([upgradeTo(DAO, NEW_IMPL), upgradeTo(DAO, NEW_IMPL), upgradeTo(DAO, NEW_IMPL)], {
      upgrades: {
        '0': facts({ proposedVerified: false, proposedContractName: null }),
        '1': facts({ proposedCodeHash: null, proposedVerified: null }),
      },
    })

    const { findings } = UpgradeCheck.run(ctx)

    expect(findings.map(f => f.kind)).to.deep.eq([
      IAssessmentFindingKind.NeedsReview,
      IAssessmentFindingKind.NeedsReview,
      IAssessmentFindingKind.NeedsReview,
    ])
    expect(findings[0].title).to.eq(`Upgrades the DAO to unverified code at ${NEW_IMPL}`)
    expect(findings[1].details).to.include('the new implementation has no code at the evidence block')
    expect(findings[2].details).to.include('the current and the new implementation code could not be read')
    expect(findings[2].after).to.deep.eq({ proxy: DAO, proposedImplementation: NEW_IMPL })
  })

  it('points at the later actions that run against the new code and says when the code does not change', () => {
    const same = keccak256('0x6001')
    const ctx = ctxWith([transfer(ADMIN), upgradeTo(DAO, NEW_IMPL), transfer(DAO), transfer(ADMIN), transfer(DAO)], {
      upgrades: { '1': facts({ proposedCodeHash: same, blockPinned: false }) },
      simulation: { ...fakeAssessmentContext().simulation, status: 'ok', reason: null },
    })

    const { findings } = UpgradeCheck.run(ctx)

    expect(findings).to.have.length(1)
    expect(findings[0].details).to.include('the new implementation has the same code as the current one')
    expect(findings[0].details).to.include('later actions on the same contract run against the new code: 2, 4')
    expect(findings[0].evidenceLimit).to.contain('read at the current block')
    expect(findings[0].evidenceLimit).to.not.contain('not simulated')
  })

  it('is not applicable without actions and finds nothing without an upgrade', () => {
    expect(UpgradeCheck.run(ctxWith([])).status).to.eq('notApplicable')
    expect(UpgradeCheck.run(ctxWith([transfer(ADMIN)])).findings).to.deep.eq([])
  })
})
