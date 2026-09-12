import ContractHelper from '@helpers/contractHelper'
import BottleneckModule from '@modules/bottleneck'
import OwnershipCheck from '@modules/proposalChecks/checks/control/ownership'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import OwnershipFacts from '@modules/proposalChecks/ownership'
import RecipientResolver from '@modules/proposalChecks/recipients'
import ProviderModule from '@modules/provider'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { TERM_PARITY_PRIME } from '@test/mock/proposalChecks/incidents'
import { type IAssessmentContext, IAssessmentFindingKind, type IResolvedAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface } from 'ethers'
import sinon from 'sinon'

const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const VAULT = '0x1111111111111111111111111111111111111111'
const NEW_OWNER = '0x2222222222222222222222222222222222222222'
const OLD_OWNER = '0x3333333333333333333333333333333333333333'
const ZERO = '0x0000000000000000000000000000000000000000'
const ROLE = '0x' + 'ab'.repeat(32)
const iface = new Interface([
  'function transferOwnership(address)',
  'function acceptOwnership()',
  'function renounceOwnership()',
  'function setPendingGovernor(address)',
  'function acceptGovernor()',
  'function setGuardian(address)',
  'function grantRole(bytes32,address)',
  'function revokeRole(bytes32,address)',
  'function transfer(address,uint256)',
])
const call = (to: string, fn: string, args: any[] = []) => ({
  to,
  value: '0',
  data: iface.encodeFunctionData(fn, args),
})
const resolved = (overrides: Partial<IResolvedAddress> = {}): IResolvedAddress => ({
  address: NEW_OWNER,
  kind: 'contract',
  verified: true,
  contractName: 'Treasury',
  deployedAtBlock: 1,
  deployedAt: 1,
  deployer: OLD_OWNER,
  deployedByCreator: false,
  recentlyDeployed: false,
  ...overrides,
})
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    ...overrides,
  }
}

describe('proposalChecks/ownership', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('reads the supported role calls into one shape and lists new holders as beneficiaries', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        call(VAULT, 'transferOwnership', [NEW_OWNER]),
        call(VAULT, 'acceptGovernor'),
        call(VAULT, 'grantRole', [ROLE, NEW_OWNER]),
        call(VAULT, 'revokeRole', [ROLE, OLD_OWNER]),
        call(VAULT, 'setGuardian', [OLD_OWNER]),
        call(VAULT, 'transfer', [NEW_OWNER, 1]),
      ],
      DAO,
    )

    expect(actions.map(OwnershipFacts.callOf)).to.deep.eq([
      { kind: 'owner', holder: NEW_OWNER },
      { kind: 'acceptGovernor' },
      { kind: 'role', role: ROLE, holder: NEW_OWNER, granted: true },
      { kind: 'role', role: ROLE, holder: OLD_OWNER, granted: false },
      { kind: 'guardian', holder: OLD_OWNER },
      null,
    ])
    expect(RecipientResolver.beneficiaries(actions)).to.deep.eq([NEW_OWNER, OLD_OWNER])
  })

  it('reads the holder in place at the block through the role getter, and the contract name', async () => {
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const coder = AbiCoder.defaultAbiCoder()
    const provider = {
      call: sandbox.stub().resolves(coder.encode(['address'], [OLD_OWNER])),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
    sandbox.stub(ContractHelper, 'getSourceCode').resolves([{ ContractName: 'MetaVault', ABI: '[]' }] as any)
    const actions = AssessmentContextBuilder._flatten(
      [call(VAULT, 'setPendingGovernor', [NEW_OWNER]), call(VAULT, 'grantRole', [ROLE, NEW_OWNER])],
      DAO,
    )

    const loaded = await OwnershipFacts.load(actions, NetworksEnum.ethereumMainnet, 100)

    expect(loaded['0']).to.deep.eq({ before: OLD_OWNER, targetName: 'MetaVault' })
    expect(loaded['1']).to.deep.eq({ before: null, targetName: 'MetaVault' })
    expect(provider.call.callCount).to.eq(1)
    expect(provider.call.args[0][0].blockTag).to.eq(100)
  })
})

describe('proposalChecks/checks/control/ownership', () => {
  it('reports every role change on an external contract as a change, naming the holders before and after', () => {
    const ctx = ctxWith(
      [
        call(VAULT, 'transferOwnership', [NEW_OWNER]),
        call(VAULT, 'renounceOwnership'),
        call(VAULT, 'setGuardian', [NEW_OWNER]),
        call(VAULT, 'grantRole', [ROLE, NEW_OWNER]),
      ],
      {
        ownership: {
          '0': { before: OLD_OWNER, targetName: 'MetaVault' },
          '1': { before: DAO, targetName: 'MetaVault' },
        },
        recipients: { [NEW_OWNER.toLowerCase()]: resolved() },
      },
    )

    const { findings } = OwnershipCheck.run(ctx)

    expect(findings.map(f => [f.id, f.kind, f.notify])).to.deep.eq([
      ['control/ownership:owner:0', IAssessmentFindingKind.Change, true],
      ['control/ownership:renounceOwnership:1', IAssessmentFindingKind.Change, true],
      ['control/ownership:guardian:2', IAssessmentFindingKind.Change, true],
      ['control/ownership:role:3', IAssessmentFindingKind.Change, true],
    ])
    expect(findings[0].title).to.eq(`Transfers ownership of MetaVault at ${VAULT} to ${NEW_OWNER} (was ${OLD_OWNER})`)
    expect(findings[0].details).to.include('the new holder is a verified contract (Treasury)')
    expect(findings[1].title).to.eq(`Gives up ownership of MetaVault at ${VAULT} (was the DAO)`)
    expect(findings[2].evidenceLimit).to.contain('could not be read')
    expect(findings[3].title).to.eq(`Grants role ${ROLE} on contract ${VAULT} to ${NEW_OWNER}`)
  })

  it('tags an unverified or freshly creator-deployed new holder for review, and leaves the DAO itself untagged', () => {
    const ctx = ctxWith([call(VAULT, 'transferOwnership', [NEW_OWNER]), call(VAULT, 'transferOwnership', [DAO])], {
      recipients: { [NEW_OWNER.toLowerCase()]: resolved({ verified: false, contractName: null }) },
    })

    const { findings } = OwnershipCheck.run(ctx)

    expect(findings[0].kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(findings[0].details).to.include('new holder is a contract with no verified source')
    expect(findings[1].kind).to.eq(IAssessmentFindingKind.Change)
    expect(findings[1].title).to.contain('to the DAO')
  })

  it('reads the Term takeover: the DAO is nominated through the Delay and then accepts the governor role itself', () => {
    const base = fakeAssessmentContext()
    const vault = TERM_PARITY_PRIME.rawActions[5].to
    const ctx: IAssessmentContext = {
      ...base,
      request: { ...base.request, daoAddress: TERM_PARITY_PRIME.daoAddress },
      actions: AssessmentContextBuilder._flatten(TERM_PARITY_PRIME.rawActions, TERM_PARITY_PRIME.daoAddress),
      ownership: {
        '3/0': { before: OLD_OWNER, targetName: 'TermVault' },
        '5': { before: OLD_OWNER, targetName: 'TermVault' },
      },
    }

    const { findings } = OwnershipCheck.run(ctx)

    expect(findings.map(f => f.id)).to.deep.eq([
      'control/ownership:pendingGovernor:3/0',
      'control/ownership:pendingGovernor:4/0',
      'control/ownership:acceptGovernor:5',
    ])
    expect(findings[0].title).to.eq(`Nominates the DAO as governor of TermVault at ${vault} (was ${OLD_OWNER})`)
    expect(findings[2].title).to.eq(`the DAO becomes governor of TermVault at ${vault} (was ${OLD_OWNER})`)
    expect(findings.every(f => f.kind === IAssessmentFindingKind.Change && f.notify)).to.be.true
  })

  it('names an accept whose caller is unknown, skips the DAO itself, and is not applicable without actions', () => {
    const delay = new Interface(['function executeNextTx(address,uint256,bytes,uint8)'])
    const viaDelay = {
      to: VAULT,
      value: '0',
      data: delay.encodeFunctionData('executeNextTx', [VAULT, 0, iface.encodeFunctionData('acceptOwnership'), 0]),
    }
    const { findings } = OwnershipCheck.run(ctxWith([viaDelay, call(DAO, 'transferOwnership', [NEW_OWNER])]))

    expect(findings.map(f => f.id)).to.deep.eq(['control/ownership:acceptOwnership:0/0'])
    expect(findings[0].title).to.contain('an account that could not be resolved accepts ownership')
    expect(OwnershipCheck.run(ctxWith([])).status).to.eq('notApplicable')
  })
})
