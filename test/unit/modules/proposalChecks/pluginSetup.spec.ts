import { Models } from '@dbModels'
import PluginSetupCheck from '@modules/proposalChecks/checks/control/pluginSetup'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import PermissionState from '@modules/proposalChecks/permissions'
import PluginSetupFacts from '@modules/proposalChecks/pluginSetups'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { ListLogPluginSetupProcessor } from '@test/mock/fakeLogPluginSetupProcessor'
import { FakePluginRepo } from '@test/mock/fakePluginRepo'
import { PluginList } from '@test/mock/fakePlugins'
import {
  type IAssessmentContext,
  IAssessmentFindingKind,
  IAssessmentSeverity,
  type IPluginSetupFacts,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import sinon from 'sinon'

const prepared = ListLogPluginSetupProcessor[0]
const updatePrepared = ListLogPluginSetupProcessor[2]
const PREPARER = prepared.sender as string
const UPDATER = updatePrepared.sender as string
const DAO = prepared.daoAddress as string
const PLUGIN = prepared.pluginAddress as string
const REPO = prepared.pluginSetupRepo as string
const PSP = '0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f'
const OUTSIDER = '0x9999999999999999999999999999999999999999'
const OTHER_PLUGIN = '0x8888888888888888888888888888888888888888'
const BLOCK = 20_000_000
const network = NetworksEnum.ethereumMainnet
const ROOT = PermissionState.idOf('ROOT_PERMISSION')
const EXECUTE = PermissionState.idOf('EXECUTE_PERMISSION')
const psp = new Interface([
  'function applyInstallation(address _dao, (((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) _params)',
  'function applyUpdate(address _dao, (address plugin, ((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, bytes initData, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) _params)',
  'function applyUninstallation(address _dao, (address plugin, ((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions) _params)',
])
const dao = new Interface(['function grant(address,address,bytes32)', 'function revoke(address,address,bytes32)'])
type Perm = { operation: number; where: string; who: string; condition: string; permissionId: string }
const tuple = (p: Perm) => [p.operation, p.where, p.who, p.condition, p.permissionId]
const install = (perms: Perm[], tag = [1, 1], repo = REPO) => ({
  to: PSP,
  value: '0',
  data: psp.encodeFunctionData('applyInstallation', [
    DAO,
    [[tag, repo], PLUGIN, perms.map(tuple), '0x' + '00'.repeat(32)],
  ]),
})
const update = (tag: number[], perms: Perm[] = []) => ({
  to: PSP,
  value: '0',
  data: psp.encodeFunctionData('applyUpdate', [
    DAO,
    [PLUGIN, [tag, REPO], '0x', perms.map(tuple), '0x' + '00'.repeat(32)],
  ]),
})
const uninstall = (perms: Perm[] = []) => ({
  to: PSP,
  value: '0',
  data: psp.encodeFunctionData('applyUninstallation', [DAO, [PLUGIN, [[1, 1], REPO], perms.map(tuple)]]),
})
const rootTo = (fn: 'grant' | 'revoke') => ({ to: DAO, value: '0', data: dao.encodeFunctionData(fn, [DAO, PSP, ROOT]) })
const grant = (where: string, who: string, permissionId: string): Perm => ({
  operation: 0,
  where,
  who,
  condition: '0x0000000000000000000000000000000000000000',
  permissionId,
})
const facts = (overrides: Partial<IPluginSetupFacts> = {}): IPluginSetupFacts => ({
  kind: 'install',
  dao: DAO,
  plugin: PLUGIN,
  repo: REPO,
  release: 1,
  build: 1,
  permissions: [{ op: 'grant', where: DAO, who: PLUGIN, permissionId: EXECUTE, condition: null }],
  prepared: { sender: PREPARER, release: 1, build: 1, permissionsMatch: true },
  repoSubdomain: 'token-voting',
  current: null,
  metadataOnly: null,
  ...overrides,
})
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO as any },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO as any),
    plugins: [{ address: PLUGIN, interfaceType: 'tokenVoting', isSubPlugin: false }],
    ...overrides,
  }
}

describe('proposalChecks/pluginSetups', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => sandbox.restore())

  it('reads the three apply forms into one shape, keeping the condition only for conditioned grants', () => {
    const conditioned: Perm = { ...grant(DAO, PLUGIN, EXECUTE), operation: 2, condition: OUTSIDER }
    const actions = AssessmentContextBuilder._flatten(
      [install([conditioned], [1, 3]), update([1, 4], [{ ...grant(DAO, PLUGIN, EXECUTE), operation: 1 }]), uninstall()],
      DAO as any,
    )

    const calls = actions.map(PluginSetupFacts.callOf)

    expect(calls[0]).to.deep.eq({
      kind: 'install',
      dao: DAO,
      plugin: PLUGIN,
      repo: REPO,
      release: 1,
      build: 3,
      permissions: [{ op: 'grant', where: DAO, who: PLUGIN, permissionId: EXECUTE, condition: OUTSIDER }],
    })
    expect(calls[1]).to.deep.include({ kind: 'update', release: 1, build: 4 })
    expect(calls[1]!.permissions[0].op).to.eq('revoke')
    expect(calls[2]).to.deep.include({ kind: 'uninstall', permissions: [] })
    expect(actions.every(a => a.decoding === 'known' && a.abi?.source === 'builtin')).to.be.true
  })

  it('matches an install against its indexed preparation and the repo registry', async () => {
    await Models.LogPluginSetupProcessor.create({ ...prepared } as any)
    await Models.PluginRepo.create({ ...FakePluginRepo, network, pluginRepo: REPO, subdomain: 'token-voting' } as any)
    const actions = AssessmentContextBuilder._flatten([install(prepared.permissions as Perm[])], DAO as any)

    const loaded = await PluginSetupFacts.load(actions, network, BLOCK)

    expect(loaded['0']).to.deep.eq(
      facts({
        permissions: (prepared.permissions as Perm[]).map(p => ({
          op: 'grant',
          where: p.where,
          who: p.who,
          permissionId: p.permissionId,
          condition: null,
        })),
      }),
    )
  })

  it('reads the current plugin for an update and asks the repo whether the setup contract changes', async () => {
    await Models.LogPluginSetupProcessor.create({ ...updatePrepared } as any)
    await Models.PluginRepo.create({ ...FakePluginRepo, network, pluginRepo: REPO, subdomain: 'token-voting' } as any)
    await Models.Plugin.create({
      ...PluginList[0],
      network,
      address: PLUGIN,
      daoAddress: DAO,
      pluginSetupRepoAddress: REPO,
      release: '1',
      build: '1',
    } as any)
    const same = sandbox.stub(PluginSetupFacts, '_sameSetupContract').resolves(true)
    const actions = AssessmentContextBuilder._flatten([update([1, 2])], DAO as any)

    const loaded = await PluginSetupFacts.load(actions, network, BLOCK)

    expect(loaded['0']).to.deep.include({
      kind: 'update',
      prepared: { sender: UPDATER, release: 1, build: 2, permissionsMatch: true },
      current: { interfaceType: 'tokenVoting', release: 1, build: 1, repo: REPO, asOf: 'now' },
      metadataOnly: true,
    })
    expect(same.calledOnce).to.be.true
    expect(same.args[0][0]).to.eq(REPO)
    expect([same.args[0][1].build, same.args[0][2].build]).to.deep.eq([1, 2])
  })

  it('records a preparation the index does not have, and a repo the registry does not know, as null', async () => {
    const actions = AssessmentContextBuilder._flatten([install([], [1, 1], OUTSIDER)], DAO as any)

    const loaded = await PluginSetupFacts.load(actions, network, BLOCK)

    expect(loaded['0']).to.deep.include({ prepared: null, repoSubdomain: null, current: null, metadataOnly: null })
  })

  it('flags applied permissions that differ from the prepared ones, a different condition included', async () => {
    await Models.LogPluginSetupProcessor.create({ ...prepared } as any)
    const first = prepared.permissions[0] as Perm
    const conditioned: Perm = { ...first, operation: 2, condition: OUTSIDER }
    const actions = AssessmentContextBuilder._flatten(
      [install([grant(DAO, OUTSIDER, EXECUTE)]), install([...(prepared.permissions as Perm[]).slice(1), conditioned])],
      DAO as any,
    )

    const loaded = await PluginSetupFacts.load(actions, network, BLOCK)

    expect(loaded['0'].prepared!.permissionsMatch).to.be.false
    expect(loaded['1'].prepared!.permissionsMatch).to.be.false
  })

  it('matches the preparation by repo and version, not just by plugin', async () => {
    await Models.LogPluginSetupProcessor.create({ ...prepared } as any)
    const actions = AssessmentContextBuilder._flatten([install([], [1, 2]), install([], [1, 1], OUTSIDER)], DAO as any)

    const loaded = await PluginSetupFacts.load(actions, network, BLOCK)

    expect(loaded['0'].prepared).to.eq(null)
    expect(loaded['1'].prepared).to.eq(null)
  })
})

describe('proposalChecks/checks/control/pluginSetup', () => {
  it('reports a prepared install from a registered repo as a change, with the ROOT window the batch uses', () => {
    const ctx = ctxWith([rootTo('grant'), install([]), rootTo('revoke')], { pluginSetups: { '1': facts() } })

    const { findings } = PluginSetupCheck.run(ctx)

    expect(findings).to.have.length(1)
    expect(findings[0].kind).to.eq(IAssessmentFindingKind.Change)
    expect(findings[0].notify).to.be.true
    expect(findings[0].title).to.eq(`Installs token-voting release 1 build 1 at ${PLUGIN}`)
    expect(findings[0].details).to.deep.eq([
      `prepared by ${PREPARER}`,
      '1 permission changes applied',
      'ROOT is granted to the setup processor and revoked again within this batch',
    ])
  })

  it('grades ROOT in the setup as critical and a powerful permission to an outsider as high', () => {
    const ctx = ctxWith([install([]), install([])], {
      pluginSetups: {
        '0': facts({ permissions: [{ op: 'grant', where: DAO, who: OUTSIDER, permissionId: ROOT, condition: null }] }),
        '1': facts({
          permissions: [{ op: 'grant', where: DAO, who: OUTSIDER, permissionId: EXECUTE, condition: null }],
        }),
      },
    })

    const { findings } = PluginSetupCheck.run(ctx)

    expect(findings.map(f => [f.kind, f.severity])).to.deep.eq([
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.Critical],
      [IAssessmentFindingKind.Risk, IAssessmentSeverity.High],
    ])
    expect(findings[1].details).to.include(
      `gives EXECUTE_PERMISSION on ${DAO} to ${OUTSIDER}, outside the DAO and its plugins`,
    )
  })

  it('grades an unregistered repo as high risk and a missing or mismatched preparation as needs review', () => {
    const ctx = ctxWith([install([]), install([]), install([])], {
      pluginSetups: {
        '0': facts({ repoSubdomain: null }),
        '1': facts({ prepared: null }),
        '2': facts({ prepared: { sender: PREPARER, release: 1, build: 1, permissionsMatch: false } }),
      },
    })

    const { findings } = PluginSetupCheck.run(ctx)

    expect(findings.map(f => f.kind)).to.deep.eq([
      IAssessmentFindingKind.Risk,
      IAssessmentFindingKind.NeedsReview,
      IAssessmentFindingKind.NeedsReview,
    ])
    expect(findings[0].title).to.eq(`Installs repo ${REPO} release 1 build 1 at ${PLUGIN}`)
    expect(findings[0].details[findings[0].details.length - 1]).to.contain('not a published build')
    expect(findings[1].details).to.include('no preparation for this plugin found in the index')
    expect(findings[2].details).to.include('the permissions applied are not the ones prepared')
  })

  it('reads an update: same release higher build is a change, metadata-only is said, other moves need review', () => {
    const current = { interfaceType: 'tokenVoting', release: 1, build: 1, repo: REPO, asOf: 'block' as const }
    const ctx = ctxWith([update([1, 2]), update([2, 1]), update([1, 1])], {
      pluginSetups: {
        '0': facts({ kind: 'update', build: 2, current, metadataOnly: true }),
        '1': facts({ kind: 'update', release: 2, current, metadataOnly: false }),
        '2': facts({ kind: 'update', current, metadataOnly: null }),
      },
    })

    const { findings } = PluginSetupCheck.run(ctx)

    expect(findings.map(f => f.kind)).to.deep.eq([
      IAssessmentFindingKind.Change,
      IAssessmentFindingKind.NeedsReview,
      IAssessmentFindingKind.NeedsReview,
    ])
    expect(findings[0].title).to.eq(`Updates the tokenVoting plugin ${PLUGIN} from 1.1 to 1.2`)
    expect(findings[0].details).to.include(
      'metadata-only update: the new build uses the same setup contract, no code changes',
    )
    expect(findings[1].details).to.include('moves from release 1 to release 2')
    expect(findings[2].details).to.include('build 1 is not higher than the current build 1')
    expect(findings[2].evidenceLimit).to.contain('setup contracts of the two builds not compared')
    expect(findings[0].evidenceLimit).to.not.contain("today's record")
  })

  it('grades removing the only governance plugin as high, and any other uninstall as a change', () => {
    const current = { interfaceType: 'tokenVoting', release: 1, build: 1, repo: REPO, asOf: 'block' as const }
    const alone = ctxWith([uninstall()], {
      pluginSetups: { '0': facts({ kind: 'uninstall', permissions: [], current }) },
    })
    const withAnother = ctxWith([uninstall()], {
      pluginSetups: { '0': facts({ kind: 'uninstall', permissions: [], current }) },
      plugins: [
        { address: PLUGIN, interfaceType: 'tokenVoting', isSubPlugin: false },
        { address: OTHER_PLUGIN, interfaceType: 'multisig', isSubPlugin: false },
      ],
    })

    const [first] = PluginSetupCheck.run(alone).findings
    const [second] = PluginSetupCheck.run(withAnother).findings

    expect([first.kind, first.severity]).to.deep.eq([IAssessmentFindingKind.Risk, IAssessmentSeverity.High])
    expect(first.title).to.eq(`Uninstalls the tokenVoting plugin ${PLUGIN}`)
    expect(second.kind).to.eq(IAssessmentFindingKind.Change)
  })

  it('needs review when the facts could not be read or the setup targets another DAO', () => {
    const ctx = ctxWith([install([]), install([])], { pluginSetups: { '1': facts({ dao: OUTSIDER }) } })

    const { findings } = PluginSetupCheck.run(ctx)

    expect(findings.map(f => f.kind)).to.deep.eq([
      IAssessmentFindingKind.NeedsReview,
      IAssessmentFindingKind.NeedsReview,
    ])
    expect(findings[0].details).to.include('the preparation, the repo and the plugin could not be read from the index')
    expect(findings[1].details).to.include(`the setup targets DAO ${OUTSIDER}, not this DAO`)
  })

  it('is not applicable without actions and finds nothing without a setup call', () => {
    expect(PluginSetupCheck.run(ctxWith([])).status).to.eq('notApplicable')
    expect(PluginSetupCheck.run(ctxWith([rootTo('grant')])).findings).to.deep.eq([])
  })
})
