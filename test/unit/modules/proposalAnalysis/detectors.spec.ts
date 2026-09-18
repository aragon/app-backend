import ProposalAnalysisDetectors from '@modules/proposalAnalysis/detectors'
import {
  type IProposalAnalysisAction,
  type IProposalAnalysisDetectorThresholds,
  type IProposalAnalysisFactPack,
  IProposalAnalysisFlag,
  IProposalAnalysisSeverity,
  IProposalAnalysisTargetKind,
  ISimulationStatus,
  NetworksEnum,
  ProposalActionType,
} from '@types'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'

const THRESHOLDS: IProposalAnalysisDetectorThresholds = { treasuryShareReview: 0.05, treasuryShareHigh: 0.25 }

const action = (index: number, overrides: Partial<IProposalAnalysisAction> = {}): IProposalAnalysisAction => ({
  index,
  parentIndex: null,
  depth: 0,
  type: ProposalActionType.Unknown,
  to: '0x5555555555555555555555555555555555555555',
  targetKind: IProposalAnalysisTargetKind.contract,
  targetName: 'SomeContract',
  value: '0',
  selector: '0x12345678',
  signature: null,
  functionName: null,
  notice: null,
  parameters: [],
  decoded: true,
  transfer: null,
  destinationChainId: null,
  ...overrides,
})

const transfer = (index: number, shareOfTreasury: number | null, amountUsd = 1000) =>
  action(index, {
    type: ProposalActionType.Transfer,
    functionName: 'transfer',
    transfer: {
      tokenAddress: ZeroAddress,
      symbol: 'ETH',
      decimals: 18,
      recipient: '0x4444444444444444444444444444444444444444',
      amountRaw: '1',
      amount: '1.0',
      amountUsd,
      shareOfTreasury,
      shareOfAssetBalance: null,
    },
  })

const factPack = (
  actions: IProposalAnalysisAction[],
  overrides: Partial<IProposalAnalysisFactPack> = {},
): IProposalAnalysisFactPack => ({
  contractVersion: 1,
  proposal: {
    id: 'proposal-1',
    network: NetworksEnum.ethereumMainnet,
    daoAddress: '0x1111111111111111111111111111111111111111',
    daoName: 'Test DAO',
    pluginAddress: '0x2222222222222222222222222222222222222222',
    pluginSubdomain: 'token-voting',
    creatorAddress: '0x3333333333333333333333333333333333333333',
    startDate: 1,
    endDate: 2,
    isSubProposal: false,
    executed: false,
    hasTitle: true,
    hasSummary: true,
    hasDescription: true,
  },
  governance: {
    votingMode: 1,
    supportThreshold: 500_000,
    minParticipation: 150_000,
    minDuration: 3600,
    minApprovals: null,
    onlyListed: null,
    stages: [],
  },
  treasury: { tvlUsd: 100_000, outflowUsd: null, outflowShare: null },
  actions,
  simulation: { status: ISimulationStatus.SUCCESS, runAt: 1 },
  integrity: {
    decoding: false,
    rawActionsCount: actions.length,
    topLevelActionsCount: actions.length,
    undecodedActionsCount: 0,
    actionsCountMismatch: false,
  },
  ...overrides,
})

const run = (actions: IProposalAnalysisAction[], overrides: Partial<IProposalAnalysisFactPack> = {}) =>
  ProposalAnalysisDetectors.run(factPack(actions, overrides), THRESHOLDS)

const flagsOf = (result: ReturnType<typeof run>) => result.findings.map(finding => finding.flag)

describe('Module: proposalAnalysis/detectors', () => {
  it('returns routine and no findings for a plain transfer below every threshold', () => {
    const result = run([transfer(0, 0.01)])

    expect(result).to.deep.equal({ findings: [], severity: IProposalAnalysisSeverity.routine })
  })

  describe('function based rules', () => {
    const cases: Array<[string, IProposalAnalysisFlag, IProposalAnalysisSeverity]> = [
      ['grant', IProposalAnalysisFlag.permissionChange, IProposalAnalysisSeverity.high],
      ['grantWithCondition', IProposalAnalysisFlag.permissionChange, IProposalAnalysisSeverity.high],
      ['revoke', IProposalAnalysisFlag.permissionChange, IProposalAnalysisSeverity.high],
      ['applyMultiTargetPermissions', IProposalAnalysisFlag.permissionChange, IProposalAnalysisSeverity.high],
      ['upgradeToAndCall', IProposalAnalysisFlag.upgrade, IProposalAnalysisSeverity.high],
      ['upgradeTo', IProposalAnalysisFlag.upgrade, IProposalAnalysisSeverity.high],
      ['applyInstallation', IProposalAnalysisFlag.pluginSetup, IProposalAnalysisSeverity.high],
      ['applyUpdate', IProposalAnalysisFlag.pluginSetup, IProposalAnalysisSeverity.high],
      ['applyUninstallation', IProposalAnalysisFlag.pluginSetup, IProposalAnalysisSeverity.high],
      ['updateVotingSettings', IProposalAnalysisFlag.governanceSettingsChange, IProposalAnalysisSeverity.review],
      ['updateMultisigSettings', IProposalAnalysisFlag.governanceSettingsChange, IProposalAnalysisSeverity.review],
      ['updateStages', IProposalAnalysisFlag.governanceSettingsChange, IProposalAnalysisSeverity.review],
      ['addAddresses', IProposalAnalysisFlag.membershipChange, IProposalAnalysisSeverity.review],
      ['removeAddresses', IProposalAnalysisFlag.membershipChange, IProposalAnalysisSeverity.review],
      ['mint', IProposalAnalysisFlag.tokenMint, IProposalAnalysisSeverity.review],
      ['execute', IProposalAnalysisFlag.nestedExecution, IProposalAnalysisSeverity.review],
      ['createProposal', IProposalAnalysisFlag.nestedExecution, IProposalAnalysisSeverity.review],
      ['forwardMessage', IProposalAnalysisFlag.nestedExecution, IProposalAnalysisSeverity.review],
    ]

    for (const [functionName, flag, severity] of cases) {
      it(`flags ${functionName} as ${flag} (${severity})`, () => {
        const result = run([action(0, { functionName })])

        expect(result.severity).to.equal(severity)
        expect(result.findings).to.deep.equal([{ flag, severity, actionRefs: [0], detail: { 0: functionName } }])
      })
    }

    it('fires on a function resolved from the selector even when the action is undecoded', () => {
      const result = run([action(0, { functionName: 'grant', decoded: false })])

      expect(flagsOf(result)).to.deep.equal([
        IProposalAnalysisFlag.permissionChange,
        IProposalAnalysisFlag.undecodedAction,
      ])
      expect(result.severity).to.equal(IProposalAnalysisSeverity.high)
    })

    it('merges repeated hits of one flag into a single finding', () => {
      const result = run([action(0, { functionName: 'grant' }), action(1, { functionName: 'revoke' })])

      expect(result.findings).to.deep.equal([
        {
          flag: IProposalAnalysisFlag.permissionChange,
          severity: IProposalAnalysisSeverity.high,
          actionRefs: [0, 1],
          detail: { 0: 'grant', 1: 'revoke' },
        },
      ])
    })

    it('ignores functions outside the table', () => {
      const result = run([action(0, { functionName: 'approve' }), action(1, { functionName: 'setMetadata' })])

      expect(result.findings).to.deep.equal([])
    })
  })

  describe('value to an unknown target', () => {
    it('flags native value sent with calldata to an address nobody could name', () => {
      const result = run([action(0, { value: '1', targetKind: IProposalAnalysisTargetKind.unknown })])

      expect(flagsOf(result)).to.deep.equal([IProposalAnalysisFlag.valueToUnknownTarget])
      expect(result.severity).to.equal(IProposalAnalysisSeverity.review)
    })

    it('does not flag a plain wallet payment, a named contract, the DAO or a plugin', () => {
      const result = run([
        action(0, { value: '1', targetKind: IProposalAnalysisTargetKind.wallet }),
        action(1, { value: '1', targetKind: IProposalAnalysisTargetKind.contract }),
        action(2, { value: '1', targetKind: IProposalAnalysisTargetKind.dao }),
        action(3, { value: '1', targetKind: IProposalAnalysisTargetKind.plugin }),
        action(4, { value: '0', targetKind: IProposalAnalysisTargetKind.unknown }),
      ])

      expect(result.findings).to.deep.equal([])
    })
  })

  describe('treasury share', () => {
    it('is review at the review threshold and high at the high threshold', () => {
      expect(run([transfer(0, 0.05)]).severity).to.equal(IProposalAnalysisSeverity.review)
      expect(run([transfer(0, 0.2499)]).severity).to.equal(IProposalAnalysisSeverity.review)
      expect(run([transfer(0, 0.25)]).severity).to.equal(IProposalAnalysisSeverity.high)
    })

    it('records the share per action in the finding detail', () => {
      const result = run([transfer(0, 0.3)])

      expect(result.findings).to.deep.equal([
        {
          flag: IProposalAnalysisFlag.largeTreasuryShare,
          severity: IProposalAnalysisSeverity.high,
          actionRefs: [0],
          detail: { 0: 0.3 },
        },
      ])
    })

    it('flags the aggregate outflow when the single transfers stay below the threshold', () => {
      const result = run([transfer(0, 0.03), transfer(1, 0.03), action(2, { functionName: 'setMetadata' })], {
        treasury: { tvlUsd: 100_000, outflowUsd: 6000, outflowShare: 0.06 },
      })

      expect(result.findings).to.deep.equal([
        {
          flag: IProposalAnalysisFlag.largeTreasuryShare,
          severity: IProposalAnalysisSeverity.review,
          actionRefs: [0, 1],
          detail: { outflowShare: 0.06 },
        },
      ])
    })

    it('stays quiet when the share is unknown', () => {
      const result = run([transfer(0, null)], { treasury: { tvlUsd: null, outflowUsd: 1000, outflowShare: null } })

      expect(result.findings).to.deep.equal([])
    })
  })

  describe('proposal level rules', () => {
    it('flags an undecoded action', () => {
      const result = run([action(0, { decoded: false })])

      expect(result.findings).to.deep.equal([
        { flag: IProposalAnalysisFlag.undecodedAction, severity: IProposalAnalysisSeverity.review, actionRefs: [0] },
      ])
    })

    it('flags a failed simulation and ignores a missing or successful one', () => {
      expect(flagsOf(run([], { simulation: { status: ISimulationStatus.FAILED, runAt: 1 } }))).to.deep.equal([
        IProposalAnalysisFlag.simulationFailed,
      ])
      expect(run([], { simulation: { status: null, runAt: null } }).findings).to.deep.equal([])
      expect(run([]).findings).to.deep.equal([])
    })

    it('flags missing metadata only when both the title and the description are missing', () => {
      const proposal = factPack([]).proposal

      expect(flagsOf(run([], { proposal: { ...proposal, hasTitle: false, hasDescription: false } }))).to.deep.equal([
        IProposalAnalysisFlag.metadataMissing,
      ])
      expect(run([], { proposal: { ...proposal, hasTitle: false } }).findings).to.deep.equal([])
      expect(run([], { proposal: { ...proposal, hasDescription: false } }).findings).to.deep.equal([])
    })

    it('flags a raw/decoded action count mismatch with both counts', () => {
      const result = run([], {
        integrity: {
          decoding: false,
          rawActionsCount: 3,
          topLevelActionsCount: 2,
          undecodedActionsCount: 0,
          actionsCountMismatch: true,
        },
      })

      expect(result.findings).to.deep.equal([
        {
          flag: IProposalAnalysisFlag.actionCountMismatch,
          severity: IProposalAnalysisSeverity.review,
          actionRefs: [],
          detail: { rawActionsCount: 3, topLevelActionsCount: 2 },
        },
      ])
    })
  })

  describe('severity', () => {
    it('is the highest severity across findings and lists findings highest first', () => {
      const result = run([action(0, { decoded: false }), transfer(1, 0.3), action(2, { functionName: 'mint' })])

      expect(result.severity).to.equal(IProposalAnalysisSeverity.high)
      expect(flagsOf(result)).to.deep.equal([
        IProposalAnalysisFlag.largeTreasuryShare,
        IProposalAnalysisFlag.undecodedAction,
        IProposalAnalysisFlag.tokenMint,
      ])
    })

    it('maxSeverity picks the highest and treats nothing as routine', () => {
      const { routine, review, high } = IProposalAnalysisSeverity

      expect(ProposalAnalysisDetectors.maxSeverity()).to.equal(routine)
      expect(ProposalAnalysisDetectors.maxSeverity(null, undefined)).to.equal(routine)
      expect(ProposalAnalysisDetectors.maxSeverity(routine, review)).to.equal(review)
      expect(ProposalAnalysisDetectors.maxSeverity(review, routine)).to.equal(review)
      expect(ProposalAnalysisDetectors.maxSeverity(high, review, routine)).to.equal(high)
      expect(ProposalAnalysisDetectors.maxSeverity(routine, high)).to.equal(high)
    })
  })
})
