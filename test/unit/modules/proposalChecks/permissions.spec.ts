import { Models } from '@dbModels'
import PermissionsCheck from '@modules/proposalChecks/checks/control/permissions'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import PermissionState, { ANY_ADDR } from '@modules/proposalChecks/permissions'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { AUDIOVISUAL } from '@test/mock/proposalChecks/incidents'
import { IAssessmentFindingKind, IAssessmentSeverity, type IPermissionTable, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const DAO = AUDIOVISUAL.daoAddress
const PLUGIN = AUDIOVISUAL.pluginAddress
const ADMIN = '0x1111111111111111111111111111111111111111'
const SPP = '0x2222222222222222222222222222222222222222'
const PSP = '0x3333333333333333333333333333333333333333'
const OUTSIDER = AUDIOVISUAL.creatorAddress
const AVA = '0x46122a25470728244fb45fe3955f965e6ccf8fb8'
const COND = '0x4444444444444444444444444444444444444444'
const network = NetworksEnum.polygonMainnet
const ROOT = PermissionState.idOf('ROOT_PERMISSION')
const EXECUTE = PermissionState.idOf('EXECUTE_PERMISSION')
const MINT = PermissionState.idOf('MINT_PERMISSION')
const EXECUTE_PROPOSAL = PermissionState.idOf('EXECUTE_PROPOSAL_PERMISSION')
const EDIT = PermissionState.idOf('EDIT_PERMISSION')
const CANCEL = PermissionState.idOf('CANCEL_PERMISSION')

const dao = new Interface([
  'function grant(address,address,bytes32)',
  'function grantWithCondition(address,address,bytes32,address)',
  'function revoke(address,address,bytes32)',
  'function applySingleTargetPermissions(address,(uint8,address,bytes32)[])',
  'function applyMultiTargetPermissions((uint8,address,address,address,bytes32)[])',
])
const call = (fn: string, args: any[]) => ({ to: DAO, value: '0', data: dao.encodeFunctionData(fn, args) })
const grants = (...items: [string, string, string, string | null][]): IPermissionTable => ({
  available: true,
  grants: Object.fromEntries(
    items.map(([where, who, permissionId, condition]) => [
      PermissionState.key(where, who, permissionId),
      { where, who, permissionId, condition },
    ]),
  ),
})
const ctxWith = (rawActions: any[], overrides: Partial<ReturnType<typeof fakeAssessmentContext>> = {}) => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    permissions: grants([DAO, DAO, ROOT, null], [DAO, PLUGIN, EXECUTE, null]),
    plugins: [
      { address: PLUGIN, interfaceType: 'tokenVoting', isSubPlugin: false },
      { address: ADMIN, interfaceType: 'admin', isSubPlugin: false },
      { address: SPP, interfaceType: 'spp', isSubPlugin: false },
    ],
    sppStages: { [SPP.toLowerCase()]: { editable: false, cancelable: false } },
    ...overrides,
  }
}
const event = (
  blockNumber: number,
  event: 'Granted' | 'Revoked',
  who: string,
  permissionId: string,
  where = DAO,
  conditionAddress?: string,
) => ({
  network,
  blockNumber,
  transactionHash: '0x00',
  transactionIndex: 1,
  logIndex: blockNumber,
  daoAddress: DAO,
  permissionId,
  whoAddress: who,
  whereAddress: where,
  event,
  ...(conditionAddress ? { conditionAddress } : {}),
})

describe('proposalChecks/permissions state', () => {
  it('folds the indexed events up to the evidence block into the live grants', async () => {
    await Models.DaoPermission.create(event(100, 'Granted', DAO, ROOT))
    await Models.DaoPermission.create(event(101, 'Granted', PLUGIN, EXECUTE))
    await Models.DaoPermission.create(event(102, 'Granted', OUTSIDER, MINT, AVA, COND))
    await Models.DaoPermission.create(event(103, 'Revoked', PLUGIN, EXECUTE))
    await Models.DaoPermission.create(event(500, 'Granted', PLUGIN, EXECUTE))

    const table = await PermissionState.load(DAO, network, 200)

    expect(table.available).to.eq(true)
    expect(Object.keys(table.grants)).to.have.length(2)
    expect(table.grants[PermissionState.key(AVA, OUTSIDER, MINT)]).to.deep.eq({
      where: AVA,
      who: OUTSIDER,
      permissionId: MINT,
      condition: COND,
    })
    expect(table.grants[PermissionState.key(DAO, PLUGIN, EXECUTE)]).to.eq(undefined)
  })

  it('reports the table as unavailable when the DAO has no indexed permission events', async () => {
    const table = await PermissionState.load(DAO, network, 200)
    expect(table).to.deep.eq({ available: false, grants: {} })
  })

  it('decodes the five permission calls into ordered grants and revokes, batch items numbered', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        call('grant', [AVA, OUTSIDER, MINT]),
        call('grantWithCondition', [DAO, OUTSIDER, EXECUTE, COND]),
        call('revoke', [AVA, OUTSIDER, MINT]),
        call('applySingleTargetPermissions', [
          AVA,
          [
            [0, OUTSIDER, MINT],
            [1, OUTSIDER, MINT],
          ],
        ]),
        call('applyMultiTargetPermissions', [
          [
            [2, DAO, OUTSIDER, COND, EXECUTE],
            [1, DAO, OUTSIDER, ANY_ADDR, EXECUTE],
          ],
        ]),
        AUDIOVISUAL.rawActions[1],
      ],
      DAO,
    )

    const ops = actions.flatMap(a => (PermissionState.isPermissionCall(a) ? PermissionState.opsOf(a) : []))

    expect(ops.map(o => [o.path, o.op, o.who, PermissionState.nameOf(o.permissionId), o.condition])).to.deep.eq([
      ['0', 'grant', OUTSIDER, 'MINT_PERMISSION', null],
      ['1', 'grant', OUTSIDER, 'EXECUTE_PERMISSION', COND],
      ['2', 'revoke', OUTSIDER, 'MINT_PERMISSION', null],
      ['3', 'grant', OUTSIDER, 'MINT_PERMISSION', null],
      ['3#1', 'revoke', OUTSIDER, 'MINT_PERMISSION', null],
      ['4', 'grant', OUTSIDER, 'EXECUTE_PERMISSION', COND],
      ['4#1', 'revoke', OUTSIDER, 'EXECUTE_PERMISSION', null],
    ])
    expect(actions.every(a => !PermissionState.isPermissionCall(a) || a.decoding === 'known')).to.eq(true)
  })
})

describe('proposalChecks/checks/control/permissions', () => {
  it('grades the Audiovisual MINT sandwich as a high risk to an outsider used within the proposal', () => {
    const result = PermissionsCheck.run(ctxWith(AUDIOVISUAL.rawActions))

    const [finding] = result.findings
    expect(result.findings).to.have.length(1)
    expect(finding.id).to.eq('control/permissions:grant:0')
    expect(finding.kind).to.eq(IAssessmentFindingKind.Risk)
    expect(finding.severity).to.eq(IAssessmentSeverity.High)
    expect(finding.title).to.contain('Grants MINT_PERMISSION to')
    expect(finding.details).to.include(`${OUTSIDER} is not the DAO or one of its plugins`)
    expect(finding.evidenceLimit).to.eq(undefined)
  })

  it('reads the install pattern as a change and a standing ROOT grant as critical', () => {
    const install = PermissionsCheck.run(
      ctxWith([call('grant', [DAO, PSP, ROOT]), call('revoke', [DAO, PSP, ROOT])]),
    ).findings
    expect(install.map(f => [f.kind, f.notify])).to.deep.eq([
      [IAssessmentFindingKind.Change, true],
      [IAssessmentFindingKind.Change, true],
    ])
    expect(install[0].title).to.contain('for the duration of this proposal')

    const [standing] = PermissionsCheck.run(ctxWith([call('grant', [DAO, PSP, ROOT])])).findings
    expect(standing.severity).to.eq(IAssessmentSeverity.Critical)
    expect(standing.title).to.contain('permanently')
  })

  it('grades a ROOT window as high when the holder is called while it has ROOT, unless the call is a plugin setup', () => {
    const psp = new Interface([
      'function applyInstallation(address _dao, (((uint8 release, uint16 build) versionTag, address pluginSetupRepo) pluginSetupRef, address plugin, (uint8 operation, address where, address who, address condition, bytes32 permissionId)[] permissions, bytes32 helpersHash) _params)',
    ])
    const apply = {
      to: PSP,
      value: '0',
      data: psp.encodeFunctionData('applyInstallation', [DAO, [[[1, 1], AVA], PLUGIN, [], '0x' + '00'.repeat(32)]]),
    }
    const poke = { to: PSP, value: '0', data: '0x12345678' }

    const prepared = (path: string) => ({
      [path]: {
        kind: 'install' as const,
        dao: DAO,
        plugin: PLUGIN,
        repo: AVA,
        release: 1,
        build: 1,
        permissions: [],
        prepared: { sender: OUTSIDER, release: 1, build: 1, permissionsMatch: true },
        repoSubdomain: 'x',
        current: null,
        metadataOnly: null,
      },
    })
    const [install] = PermissionsCheck.run(
      ctxWith([call('grant', [DAO, PSP, ROOT]), apply, call('revoke', [DAO, PSP, ROOT])], {
        pluginSetups: prepared('1'),
      }),
    ).findings
    const [reached] = PermissionsCheck.run(
      ctxWith([call('grant', [DAO, PSP, ROOT]), poke, call('revoke', [DAO, PSP, ROOT])]),
    ).findings
    const [unprepared] = PermissionsCheck.run(
      ctxWith([call('grant', [DAO, PSP, ROOT]), apply, call('revoke', [DAO, PSP, ROOT])]),
    ).findings
    const [mixed] = PermissionsCheck.run(
      ctxWith([call('grant', [DAO, PSP, ROOT]), apply, poke, call('revoke', [DAO, PSP, ROOT])], {
        pluginSetups: prepared('1'),
      }),
    ).findings

    expect(install.kind).to.eq(IAssessmentFindingKind.Change)
    expect(install.details[0]).to.contain('the install pattern')
    expect([reached.kind, reached.severity]).to.deep.eq([IAssessmentFindingKind.Risk, IAssessmentSeverity.High])
    expect(reached.details[0]).to.contain('called at 1 while it has ROOT')
    expect(unprepared.severity).to.eq(IAssessmentSeverity.High)
    expect(mixed.severity).to.eq(IAssessmentSeverity.High)
    expect(mixed.details[0]).to.contain('called at 2 while it has ROOT')
  })

  it('needs review instead of concluding when the table or the stage settings are missing', () => {
    const [blindRevoke] = PermissionsCheck.run(
      ctxWith([call('revoke', [AVA, OUTSIDER, MINT])], { permissions: { available: false, grants: {} } }),
    ).findings
    const [noStages] = PermissionsCheck.run(ctxWith([call('grant', [SPP, OUTSIDER, EDIT])], { sppStages: {} })).findings

    expect(blindRevoke.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(blindRevoke.details[0]).to.contain('not available')
    expect(noStages.kind).to.eq(IAssessmentFindingKind.NeedsReview)
    expect(noStages.details[0]).to.contain('stage settings')
  })

  it('flags giving ROOT away while giving up its own as becoming subordinate, and the last ROOT revoke as a freeze', () => {
    const [give, drop] = PermissionsCheck.run(
      ctxWith([call('grant', [DAO, OUTSIDER, ROOT]), call('revoke', [DAO, DAO, ROOT])]),
    ).findings
    expect(give.details).to.include(`the DAO also gives up its own ROOT: it becomes subordinate to ${OUTSIDER}`)
    expect(drop.kind).to.eq(IAssessmentFindingKind.Change)

    const [freeze] = PermissionsCheck.run(ctxWith([call('revoke', [DAO, DAO, ROOT])])).findings
    expect(freeze.severity).to.eq(IAssessmentSeverity.Critical)
    expect(freeze.title).to.contain('the last ROOT holder')
  })

  it('grades ANY_ADDR grants by what the DAO allows and by the power opened', () => {
    const findings = PermissionsCheck.run(
      ctxWith([
        call('grant', [DAO, ANY_ADDR, EXECUTE]),
        call('grant', [AVA, ANY_ADDR, MINT]),
        call('grant', [DAO, ANY_ADDR, PermissionState.idOf('CREATE_PROPOSAL_PERMISSION')]),
      ]),
    ).findings

    expect(findings[0].kind).to.eq(IAssessmentFindingKind.Change)
    expect(findings[0].title).to.contain('which the DAO refuses')
    expect(findings[1].severity).to.eq(IAssessmentSeverity.High)
    expect(findings[1].title).to.contain('to everyone')
    expect(findings[2].kind).to.eq(IAssessmentFindingKind.Change)
    expect(findings[2].severity).to.eq(undefined)
  })

  it('treats a new admin as critical, SPP EDIT and CANCEL by whether a stage allows them', () => {
    const [admin] = PermissionsCheck.run(ctxWith([call('grant', [ADMIN, OUTSIDER, EXECUTE_PROPOSAL])])).findings
    expect(admin.severity).to.eq(IAssessmentSeverity.Critical)
    expect(admin.title).to.contain('a new admin')

    const dormant = PermissionsCheck.run(
      ctxWith([call('grant', [SPP, OUTSIDER, EDIT]), call('grant', [SPP, OUTSIDER, CANCEL])]),
    ).findings
    expect(dormant.map(f => [f.kind, f.title.endsWith('dormant')])).to.deep.eq([
      [IAssessmentFindingKind.Change, true],
      [IAssessmentFindingKind.Change, true],
    ])

    const live = PermissionsCheck.run(
      ctxWith([call('grant', [SPP, OUTSIDER, EDIT]), call('grant', [SPP, OUTSIDER, CANCEL])], {
        sppStages: { [SPP.toLowerCase()]: { editable: true, cancelable: true } },
      }),
    ).findings
    expect(live.map(f => f.severity)).to.deep.eq([IAssessmentSeverity.Critical, IAssessmentSeverity.High])
  })

  it('keeps a powerful grant to the DAO or its own plugin as a change, and an outsider as a risk', () => {
    const [own, plugin, outsider] = PermissionsCheck.run(
      ctxWith([
        call('grant', [AVA, DAO, MINT]),
        call('grant', [DAO, PLUGIN, EXECUTE]),
        call('grant', [AVA, OUTSIDER, MINT]),
      ]),
    ).findings
    expect(own.kind).to.eq(IAssessmentFindingKind.Change)
    expect(plugin.kind).to.eq(IAssessmentFindingKind.Change)
    expect(plugin.details).to.include("granted to the DAO's own tokenVoting plugin")
    expect(outsider.severity).to.eq(IAssessmentSeverity.High)
  })

  it('reports a plain grant over a conditioned one and a revoke of nothing as no-ops that are not sent', () => {
    const ctx = ctxWith([call('grant', [DAO, OUTSIDER, EXECUTE]), call('revoke', [AVA, OUTSIDER, MINT])], {
      permissions: grants([DAO, DAO, ROOT, null], [DAO, OUTSIDER, EXECUTE, COND]),
    })

    const findings = PermissionsCheck.run(ctx).findings

    expect(findings.map(f => [f.notify, f.title.endsWith('which changes nothing')])).to.deep.eq([
      [false, true],
      [false, true],
    ])
    expect(findings[0].details[0]).to.contain(`already granted behind condition ${COND}`)
  })

  it('flags revoking execution from a governance plugin as high, names permission calls on other contracts, and states a missing table', () => {
    const [lost] = PermissionsCheck.run(ctxWith([call('revoke', [DAO, PLUGIN, EXECUTE])])).findings
    expect(lost.severity).to.eq(IAssessmentSeverity.High)
    expect(lost.title).to.contain('a governance plugin loses execution')

    const [external] = PermissionsCheck.run(ctxWith([{ ...call('grant', [AVA, OUTSIDER, MINT]), to: AVA }])).findings
    expect(external.id).to.eq('control/permissions:external:0')
    expect(external.title).to.contain('a contract other than the DAO')

    const [blind] = PermissionsCheck.run(
      ctxWith([call('grant', [AVA, OUTSIDER, MINT])], { permissions: { available: false, grants: {} } }),
    ).findings
    expect(blind.evidenceLimit).to.contain('permission table at the evidence block not available')
  })
})
