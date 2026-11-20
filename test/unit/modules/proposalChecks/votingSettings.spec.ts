import { Models } from '@dbModels'
import VotingSettingsCheck from '@modules/proposalChecks/checks/voting/settings'
import AssessmentContextBuilder from '@modules/proposalChecks/context'
import VotingSettingsFacts from '@modules/proposalChecks/votingSettings'
import { fakeAssessmentContext } from '@test/mock/fakeAssessmentContext'
import { fakeSettings } from '@test/mock/fakeSettings'
import { type IAssessmentContext, IAssessmentFindingKind } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'

const network = fakeSettings.network
const DAO = '0xaFe8123417B112B352B356F0eA50becC471Ed853'
const VOTING = fakeSettings.pluginAddress
const LTV = '0x1111111111111111111111111111111111111111'
const MULTISIG = '0x2222222222222222222222222222222222222222'
const iface = new Interface([
  'function updateVotingSettings((uint8,uint32,uint32,uint64,uint256))',
  'function updateVotingSettings((uint8,uint32,uint32,uint32,uint64,uint256))',
  'function updateMultisigSettings((bool,uint16))',
  'function transfer(address,uint256)',
])
const majority = (to: string, values: any[]) => ({
  to,
  value: '0',
  data: iface.encodeFunctionData('updateVotingSettings((uint8,uint32,uint32,uint64,uint256))', [values]),
})
const lockToVote = (to: string, values: any[]) => ({
  to,
  value: '0',
  data: iface.encodeFunctionData('updateVotingSettings((uint8,uint32,uint32,uint32,uint64,uint256))', [values]),
})
const multisig = (to: string, values: any[]) => ({
  to,
  value: '0',
  data: iface.encodeFunctionData('updateMultisigSettings((bool,uint16))', [values]),
})
const current = {
  votingMode: '1',
  supportThreshold: '500000',
  minParticipation: '150000',
  minDuration: '3600',
  minProposerVotingPower: '0',
}
const ctxWith = (rawActions: any[], overrides: Partial<IAssessmentContext> = {}): IAssessmentContext => {
  const base = fakeAssessmentContext()
  return {
    ...base,
    request: { ...base.request, daoAddress: DAO },
    actions: AssessmentContextBuilder._flatten(rawActions, DAO),
    plugins: [
      { address: VOTING, interfaceType: 'tokenVoting', isSubPlugin: false },
      { address: LTV, interfaceType: 'lockToVote', isSubPlugin: false },
      { address: MULTISIG, interfaceType: 'multisig', isSubPlugin: false },
    ],
    ...overrides,
  }
}

describe('proposalChecks/votingSettings', () => {
  it('tells the three settings updates apart by signature and keeps every value as a string', () => {
    const actions = AssessmentContextBuilder._flatten(
      [
        majority(VOTING, [0, 400000, 100000, 86400, 5n]),
        lockToVote(LTV, [2, 400000, 100000, 50000, 7200, 0]),
        multisig(MULTISIG, [false, 2]),
        { to: VOTING, value: '0', data: iface.encodeFunctionData('transfer', [DAO, 1]) },
      ],
      DAO,
    )

    expect(actions.map(VotingSettingsFacts.callOf)).to.deep.eq([
      {
        plugin: 'majority',
        values: {
          votingMode: '0',
          supportThreshold: '400000',
          minParticipation: '100000',
          minDuration: '86400',
          minProposerVotingPower: '5',
        },
      },
      {
        plugin: 'lockToVote',
        values: {
          votingMode: '2',
          supportThresholdRatio: '400000',
          minParticipationRatio: '100000',
          minApprovalRatio: '50000',
          proposalDuration: '7200',
          minProposerVotingPower: '0',
        },
      },
      { plugin: 'multisig', values: { onlyListed: 'false', minApprovals: '2' } },
      null,
    ])
  })

  it('reads the settings the plugin ran with at the block from the indexed history, or null when none', async () => {
    await Models.Setting.create({ ...fakeSettings, blockNumber: 100 })
    await Models.Setting.create({
      ...fakeSettings,
      transactionHash: '0x' + 'ab'.repeat(32),
      blockNumber: 300,
      supportThreshold: 600000,
    })
    const actions = AssessmentContextBuilder._flatten(
      [majority(VOTING, [0, 1, 1, 3600, 0]), multisig(MULTISIG, [true, 1])],
      DAO,
    )

    const at200 = await VotingSettingsFacts.load(actions, network, 200)
    const at400 = await VotingSettingsFacts.load(actions, network, 400)

    expect(at200['0']).to.deep.eq({ before: current })
    expect(at400['0']!.before!.supportThreshold).to.eq('600000')
    expect(at200['1']).to.deep.eq({ before: null })
  })
})

describe('proposalChecks/checks/voting/settings', () => {
  it('names every changed field with old and new value and says which way it cuts', () => {
    const ctx = ctxWith([majority(VOTING, [0, 400000, 150000, 259200, 10n])], {
      votingSettings: { '0': { before: current } },
    })

    const [finding] = VotingSettingsCheck.run(ctx).findings

    expect(finding.kind).to.eq(IAssessmentFindingKind.Change)
    expect(finding.notify).to.be.true
    expect(finding.title).to.eq(
      `Lowers the voting requirements of the tokenVoting plugin ${VOTING}: voting mode from early execution to standard; support threshold from 50% to 40%; minimum voting duration from 1 hour to 3 days; voting power needed to propose from 0 units to 10 units`,
    )
    expect(finding.details).to.deep.eq([
      'voting mode from early execution to standard: a change of mode, neither more nor less is needed',
      'support threshold from 50% to 40%: a reduction, later proposals pass more easily',
      'minimum voting duration from 1 hour to 3 days: an increase, later proposals need more',
      'voting power needed to propose from 0 units to 10 units: an increase, later proposals need more',
      'settings are frozen into each proposal at creation, so this affects only proposals created afterwards',
    ])
    expect(finding.evidenceLimit).to.eq(undefined)
    expect((finding.after as any).changes.map((c: any) => c.direction)).to.deep.eq([
      'changed',
      'reduced',
      'unchanged',
      'increased',
      'increased',
    ])
  })

  it('reads the multisig and lock-to-vote fields: fewer approvals, open proposing and a lower approval floor are reductions', () => {
    const ctx = ctxWith([multisig(MULTISIG, [false, 1]), lockToVote(LTV, [0, 500000, 100000, 20000, 604800, 0])], {
      votingSettings: {
        '0': { before: { onlyListed: 'true', minApprovals: '3' } },
        '1': {
          before: {
            votingMode: '0',
            supportThresholdRatio: '500000',
            minParticipationRatio: '100000',
            minApprovalRatio: '50000',
            proposalDuration: '604800',
            minProposerVotingPower: '0',
          },
        },
      },
    })

    const { findings } = VotingSettingsCheck.run(ctx)

    expect(findings[0].title).to.eq(
      `Lowers the voting requirements of the multisig plugin ${MULTISIG}: only listed members may propose from yes to no; required approvals from 3 to 1`,
    )
    expect(findings[1].title).to.eq(
      `Lowers the voting requirements of the lockToVote plugin ${LTV}: minimum approval from 5% to 2%`,
    )
  })

  it('leaves the direction unknown without prior settings, notes an unknown plugin and a duration the contract rejects', () => {
    const ctx = ctxWith([majority(VOTING, [0, 400000, 100000, 60, 0]), majority(DAO, [0, 400000, 100000, 3600, 0])])

    const { findings } = VotingSettingsCheck.run(ctx)

    expect(findings[0].title).to.contain('Changes the voting requirements')
    expect(findings[0].title).to.contain('support threshold set to 40%')
    expect(findings[0].details[0]).to.contain('direction unknown without the prior value')
    expect(findings[0].evidenceLimit).to.contain('prior settings not indexed')
    expect(findings[0].evidenceLimit).to.contain('minimum voting duration of 60 seconds is outside')
    expect(findings[1].evidenceLimit).to.contain('not a plugin installed on this DAO')
  })

  it('reports an update that changes nothing as dashboard-only, and is not applicable without actions', () => {
    const ctx = ctxWith([majority(VOTING, [1, 500000, 150000, 3600, 0])], {
      votingSettings: { '0': { before: current } },
    })

    const [finding] = VotingSettingsCheck.run(ctx).findings

    expect(finding.notify).to.be.false
    expect(finding.title).to.contain('with the values it already has')
    expect(VotingSettingsCheck.run(ctxWith([])).status).to.eq('notApplicable')
  })
})
