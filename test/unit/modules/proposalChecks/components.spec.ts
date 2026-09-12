import ContractHelper from '@helpers/contractHelper'
import BottleneckModule from '@modules/bottleneck'
import ComponentsCheck from '@modules/proposalChecks/checks/control/components'
import ComponentFacts from '@modules/proposalChecks/components'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import PermissionState, { ANY_ADDR } from '@modules/proposalChecks/permissions'
import ProviderModule from '@modules/provider'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { TERM_PARITY_PRIME } from '@test/mock/proposalChecks/incidents'
import { type IAssessmentContext, IAssessmentFindingKind, IAssessmentSeverity, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface } from 'ethers'
import sinon from 'sinon'

const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const SPP = '0xea817f210A3Bf9B6B9266aFb1cdf5dC534dD96Be'
const VOTING = '0x1111111111111111111111111111111111111111'
const FORWARDER = '0x2222222222222222222222222222222222222222'
const EXECUTOR = '0x3333333333333333333333333333333333333333'
const OTHER = '0x4444444444444444444444444444444444444444'
const COND = '0x5555555555555555555555555555555555555555'
const ZERO = '0x0000000000000000000000000000000000000000'
const VALIDATE = PermissionState.idOf('VALIDATE_SIGNATURE_PERMISSION')
const iface = new Interface([
  'function setTrustedForwarder(address)',
  'function registerStandardCallback(bytes4,bytes4,bytes4)',
  'function setSignatureValidator(address)',
  'function setTargetConfig((address,uint8))',
  'function grant(address,address,bytes32)',
  'function grantWithCondition(address,address,bytes32,address)',
  'function revoke(address,address,bytes32)',
])
const call = (to: string, fn: string, args: any[]) => ({ to, value: '0', data: iface.encodeFunctionData(fn, args) })
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    plugins: [
      { address: SPP, interfaceType: 'spp', isSubPlugin: false },
      { address: VOTING, interfaceType: 'tokenVoting', isSubPlugin: false },
    ],
    ...overrides,
  }
}
const kinds = (ctx: IAssessmentContext) => ComponentsCheck.run(ctx).findings.map(f => [f.kind, f.severity ?? null])

describe('proposalChecks/components', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('reads the four component calls into one shape', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        call(DAO, 'setTrustedForwarder', [FORWARDER]),
        call(DAO, 'registerStandardCallback', ['0x150b7a02', '0x150b7a02', '0x150b7a02']),
        call(DAO, 'setSignatureValidator', [OTHER]),
        call(VOTING, 'setTargetConfig', [[EXECUTOR, 1]]),
        call(DAO, 'grant', [DAO, OTHER, VALIDATE]),
      ],
      DAO,
    )

    expect(actions.map(ComponentFacts.callOf)).to.deep.eq([
      { kind: 'forwarder', forwarder: FORWARDER },
      { kind: 'callback', interfaceId: '0x150b7a02', callbackSelector: '0x150b7a02', magicNumber: '0x150b7a02' },
      { kind: 'validator', validator: OTHER },
      { kind: 'targetConfig', target: EXECUTOR, operation: 'delegatecall' },
      null,
    ])
  })

  it('reads the forwarder and the target config in place at the block, and names the contracts involved', async () => {
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<unknown>) => fn() } as any)
    const coder = AbiCoder.defaultAbiCoder()
    const provider = {
      call: sandbox
        .stub()
        .callsFake(async (tx: { data: string }) =>
          tx.data.startsWith(iface.getFunction('setTrustedForwarder')!.selector)
            ? '0x'
            : tx.data === '0xce1b815f'
              ? coder.encode(['address'], [ZERO])
              : coder.encode(['tuple(address,uint8)'], [[DAO, 0]]),
        ),
      getNetwork: async () => ({ chainId: 1n }),
      resolveName: async (n: string) => n,
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
    const source = sandbox.stub(ContractHelper, 'getSourceCode')
    source
      .withArgs(SPP, NetworksEnum.ethereumMainnet)
      .resolves([{ ContractName: 'StagedProposalProcessor', ABI: '[]' }] as any)
    source.withArgs(VOTING, NetworksEnum.ethereumMainnet).resolves([{ ContractName: 'TokenVoting', ABI: '[]' }] as any)
    source
      .withArgs(EXECUTOR, NetworksEnum.ethereumMainnet)
      .resolves([{ ContractName: 'GlobalExecutor', ABI: '[]' }] as any)
    source.resolves(null)
    const actions = AssessmentContextBuilder._flatten(
      [call(SPP, 'setTrustedForwarder', [FORWARDER]), call(VOTING, 'setTargetConfig', [[EXECUTOR, 1]])],
      DAO,
    )

    const loaded = await ComponentFacts.load(actions, NetworksEnum.ethereumMainnet, 100)

    expect(loaded['0']).to.deep.eq({ targetName: 'StagedProposalProcessor', before: ZERO, installedName: null })
    expect(loaded['1']).to.deep.eq({
      targetName: 'TokenVoting',
      before: `${DAO} by call`,
      installedName: 'GlobalExecutor',
    })
    expect(provider.call.args.every(a => a[0].blockTag === 100)).to.be.true
  })

  it('leaves an entry out when the read fails', async () => {
    sandbox.stub(ContractHelper, 'getSourceCode').rejects(new Error('explorer down'))
    const actions = AssessmentContextBuilder._flatten([call(DAO, 'setSignatureValidator', [OTHER])], DAO)

    expect(await ComponentFacts.load(actions, NetworksEnum.ethereumMainnet, 100)).to.deep.eq({})
  })
})

describe('proposalChecks/checks/control/components', () => {
  it('reports a forwarder on the DAO as a change, on a staged processor as critical, elsewhere for a person', () => {
    const ctx = ctxWith(
      [
        call(DAO, 'setTrustedForwarder', [FORWARDER]),
        call(SPP, 'setTrustedForwarder', [FORWARDER]),
        call(OTHER, 'setTrustedForwarder', [FORWARDER]),
        call(DAO, 'setTrustedForwarder', [ZERO]),
      ],
      { components: { '0': { targetName: 'DAO', before: ZERO, installedName: null } } },
    )

    const { findings } = ComponentsCheck.run(ctx)

    expect(kinds(ctx)).to.deep.eq([
      [IAssessmentFindingKind.Change, null],
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
      [IAssessmentFindingKind.NeedsReview, null],
      [IAssessmentFindingKind.Change, null],
    ])
    expect(findings[0].title).to.eq(`Sets the trusted forwarder of the DAO from ${ZERO} to ${FORWARDER}`)
    expect(findings[0].evidenceLimit).to.contain('not read from its code')
    expect(findings[1].title).to.eq(`Sets the trusted forwarder of the spp plugin ${SPP} to ${FORWARDER}`)
    expect(findings[1].evidenceLimit).to.contain('could not be read')
    expect(findings[3].title).to.eq('Removes the trusted forwarder of the DAO')
    expect(findings.every(f => f.notify)).to.be.true
  })

  it('names a known callback and treats a callback registration as a change with no severity', () => {
    const ctx = ctxWith([
      call(DAO, 'registerStandardCallback', ['0x150b7a02', '0x150b7a02', '0x150b7a02']),
      call(DAO, 'registerStandardCallback', ['0xdeadbeef', '0xcafebabe', '0x00000000']),
    ])

    const { findings } = ComponentsCheck.run(ctx)

    expect(kinds(ctx)).to.deep.eq([
      [IAssessmentFindingKind.Change, null],
      [IAssessmentFindingKind.Change, null],
    ])
    expect(findings[0].title).to.eq('Registers a callback on the DAO: accepts ERC-721 transfers')
    expect(findings[1].title).to.eq('Registers a callback on the DAO: answers with a rejection')
  })

  it('grades a signature validator as critical and its removal as a change', () => {
    const ctx = ctxWith([call(DAO, 'setSignatureValidator', [OTHER]), call(DAO, 'setSignatureValidator', [ZERO])])

    const { findings } = ComponentsCheck.run(ctx)

    expect(kinds(ctx)).to.deep.eq([
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
      [IAssessmentFindingKind.Change, null],
    ])
    expect(findings[0].evidenceLimit).to.contain('this call reverts')
  })

  it('grades VALIDATE_SIGNATURE grants: generic validator and unconditional grantee high, conditioned grantee a change, revoke a change', () => {
    const ctx = ctxWith([
      call(DAO, 'grantWithCondition', [DAO, ANY_ADDR, VALIDATE, COND]),
      call(DAO, 'grant', [DAO, OTHER, VALIDATE]),
      call(DAO, 'grantWithCondition', [DAO, OTHER, VALIDATE, COND]),
      call(DAO, 'revoke', [DAO, OTHER, VALIDATE]),
      call(DAO, 'grant', [VOTING, OTHER, VALIDATE]),
    ])

    const { findings } = ComponentsCheck.run(ctx)

    expect(findings.map(f => [f.id, f.kind, f.severity ?? null])).to.deep.eq([
      ['control/components:0', IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
      ['control/components:1', IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
      ['control/components:2', IAssessmentFindingKind.Change, null],
      ['control/components:3', IAssessmentFindingKind.Change, null],
    ])
    expect(findings[0].title).to.eq(`Makes condition ${COND} a generic signature validator for the DAO`)
    expect(findings[1].title).to.eq(`Lets ${OTHER} present any hash as signed by the DAO`)
    expect(findings[3].title).to.eq(`Revokes VALIDATE_SIGNATURE from ${OTHER}`)
  })

  it('grades a target config: DAO by call is a change, a contract named GlobalExecutor by delegatecall for a person, anything else a risk', () => {
    const ctx = ctxWith(
      [
        call(VOTING, 'setTargetConfig', [[DAO, 0]]),
        call(VOTING, 'setTargetConfig', [[EXECUTOR, 1]]),
        call(VOTING, 'setTargetConfig', [[OTHER, 1]]),
        call(VOTING, 'setTargetConfig', [[OTHER, 0]]),
        call(VOTING, 'setTargetConfig', [[DAO, 1]]),
      ],
      {
        components: {
          '0': { targetName: 'TokenVoting', before: `${OTHER} by call`, installedName: 'DAO' },
          '1': { targetName: 'TokenVoting', before: `${DAO} by call`, installedName: 'GlobalExecutor' },
          '2': { targetName: 'TokenVoting', before: `${DAO} by call`, installedName: 'Evil' },
        },
      },
    )

    const { findings } = ComponentsCheck.run(ctx)

    expect(kinds(ctx)).to.deep.eq([
      [IAssessmentFindingKind.Change, null],
      [IAssessmentFindingKind.NeedsReview, null],
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
      [IAssessmentFindingKind.Change, null],
    ])
    expect(findings[0].title).to.eq(`Points the tokenVoting plugin ${VOTING} at the DAO by call`)
    expect(findings[0].details[0]).to.eq(`was ${OTHER} by call`)
    expect(findings[1].title).to.contain('(named GlobalExecutor)')
    expect(findings[1].evidenceLimit).to.contain('deployment is not known')
    expect(findings[2].details).to.include(`proposal actions run as the plugin with the code at ${OTHER} (Evil)`)
    expect(findings[3].details).to.include(`the plugin executes through ${OTHER} instead of the DAO`)
    expect(findings[4].details).to.include(
      'the plugin rejects a DAO target combined with delegatecall; execute reverts on it',
    )
  })

  it('is not applicable without actions and finds nothing without a component change', () => {
    expect(ComponentsCheck.run(ctxWith([])).status).to.eq('notApplicable')
    expect(
      ComponentsCheck.run(ctxWith([call(DAO, 'grant', [DAO, OTHER, PermissionState.idOf('EXECUTE_PERMISSION')])]))
        .findings,
    ).to.deep.eq([])
  })

  describe('Safe modules, guards and the Delay', () => {
    const SAFE = '0x6666666666666666666666666666666666666666'
    const DELAY = '0x7777777777777777777777777777777777777777'
    const zodiac = new Interface([
      'function enableModule(address)',
      'function disableModule(address,address)',
      'function setGuard(address)',
      'function setTxCooldown(uint256)',
      'function setTxExpiration(uint256)',
      'function setTxNonce(uint256)',
      'function skipExpired()',
    ])
    const z = (to: string, fn: string, args: any[]) => ({ to, value: '0', data: zodiac.encodeFunctionData(fn, args) })
    const named = (targetName: string | null, installedName: string | null, before: string | null = null) => ({
      targetName,
      before,
      installedName,
    })

    it('grades a new module by what it is: a Delay or Roles module is a change, anything else executes with no signatures', () => {
      const ctx = ctxWith(
        [z(SAFE, 'enableModule', [DELAY]), z(SAFE, 'enableModule', [OTHER]), z(SAFE, 'enableModule', [DAO])],
        {
          components: {
            '0': named('GnosisSafe', 'Delay'),
            '1': named('GnosisSafe', null),
            '2': named('GnosisSafe', 'DAO'),
          },
        },
      )

      const { findings } = ComponentsCheck.run(ctx)

      expect(kinds(ctx)).to.deep.eq([
        [IAssessmentFindingKind.Change, null],
        [IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
        [IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
      ])
      expect(findings[0].title).to.eq(`Adds the Delay module ${DELAY} to GnosisSafe at ${SAFE}`)
      expect(findings[1].details[0]).to.eq(
        `${OTHER} can execute any transaction from GnosisSafe at ${SAFE} with no signatures`,
      )
      expect(findings[1].evidenceLimit).to.contain('no verified source')
      expect(findings[2].title).to.eq(`Adds module the DAO (${DAO}) to GnosisSafe at ${SAFE}`)
    })

    it('grades removing a Delay or Roles module, or the guard, as a removed safeguard', () => {
      const ctx = ctxWith(
        [
          z(SAFE, 'disableModule', [OTHER, DELAY]),
          z(SAFE, 'disableModule', [OTHER, OTHER]),
          z(SAFE, 'setGuard', [ZERO]),
          z(SAFE, 'setGuard', [OTHER]),
        ],
        {
          components: {
            '0': named('GnosisSafe', 'Delay'),
            '1': named('GnosisSafe', null),
            '2': named('GnosisSafe', null),
            '3': named('GnosisSafe', 'MyGuard'),
          },
        },
      )

      const { findings } = ComponentsCheck.run(ctx)

      expect(kinds(ctx)).to.deep.eq([
        [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
        [IAssessmentFindingKind.Change, null],
        [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
        [IAssessmentFindingKind.Change, null],
      ])
      expect(findings[0].title).to.eq(`Removes the Delay module ${DELAY} from GnosisSafe at ${SAFE}`)
      expect(findings[2].title).to.eq(`Removes the guard of GnosisSafe at ${SAFE}`)
      expect(findings[3].title).to.eq(`Sets the guard of GnosisSafe at ${SAFE} to MyGuard at ${OTHER}`)
    })

    it('grades the Delay: a zero or shorter cooldown is high, a longer one and the queue settings are changes', () => {
      const ctx = ctxWith(
        [
          z(DELAY, 'setTxCooldown', [0]),
          z(DELAY, 'setTxCooldown', [60]),
          z(DELAY, 'setTxCooldown', [7200]),
          z(DELAY, 'setTxExpiration', [0]),
          z(DELAY, 'setTxNonce', [7]),
          z(DELAY, 'skipExpired', []),
        ],
        {
          components: {
            '0': named('Delay', null, '3600'),
            '1': named('Delay', null, '3600'),
            '2': named('Delay', null, '3600'),
            '3': named('Delay', null, '86400'),
          },
        },
      )

      const { findings } = ComponentsCheck.run(ctx)

      expect(kinds(ctx)).to.deep.eq([
        [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
        [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
        [IAssessmentFindingKind.Change, null],
        [IAssessmentFindingKind.Change, null],
        [IAssessmentFindingKind.Change, null],
        [IAssessmentFindingKind.Change, null],
      ])
      expect(findings[0].title).to.eq(`Sets the cooldown of Delay at ${DELAY} to 0 seconds (was 3600 seconds)`)
      expect(findings[0].details[0]).to.contain('the delay that gave time to veto is gone')
      expect(findings[3].details[0]).to.eq('queued transactions never expire')
      expect(findings[4].title).to.contain('Skips the queued transactions')
    })

    it('reads the Term takeover: through the Roles module the Delay loses its cooldown and the DAO becomes an undelayed module of it', () => {
      const base = fakeAssessmentContext()
      const delay = TERM_PARITY_PRIME.rawActions[3].to
      const ctx: IAssessmentContext = {
        ...base,
        request: { ...base.request, daoAddress: TERM_PARITY_PRIME.daoAddress },
        actions: AssessmentContextBuilder._flatten(TERM_PARITY_PRIME.rawActions, TERM_PARITY_PRIME.daoAddress),
        components: {
          '0/0': named('Delay', null, '172800'),
          '1/0': named('Delay', null, '0'),
          '2/0': named('Delay', 'DAO'),
        },
      }

      const { findings } = ComponentsCheck.run(ctx)

      expect(findings.map(f => [f.actionPaths[0], f.kind, f.severity ?? null])).to.deep.eq([
        ['0/0', IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
        ['1/0', IAssessmentFindingKind.Change, null],
        ['2/0', IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
      ])
      expect(findings[0].title).to.eq(`Sets the cooldown of Delay at ${delay} to 0 seconds (was 172800 seconds)`)
      expect(findings[2].title).to.eq(`Adds module the DAO (${TERM_PARITY_PRIME.daoAddress}) to Delay at ${delay}`)
      expect(findings[2].details).to.include('the same batch sets the cooldown to zero, so nothing delays it')
      expect(ctx.actions.find(a => a.path === '0/0')).to.deep.include({
        via: 'callTargetFunctionWithRole',
        caller: null,
        target: delay,
      })
    })
  })
})
