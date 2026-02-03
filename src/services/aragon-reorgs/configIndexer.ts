import { CapitalDistributor } from '@artifacts/CapitalDistributor'
import { DAO } from '@artifacts/dao'
import { DAORegistry } from '@artifacts/daoRegistry'
import { DaoV2 } from '@artifacts/daoV2'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import { ExitQueue } from '@artifacts/ExitQueue'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { LockManager } from '@artifacts/LockManager'
import { LockToVote } from '@artifacts/LockToVote'
import { Multisig } from '@artifacts/Multisig'
import { Multisig2 } from '@artifacts/Multisig2'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { SharedLogs } from '@artifacts/shared'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { TokenVoting } from '@artifacts/TokenVoting'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import {
  AddressGaugeRatioModel,
  BracketsModel,
  ClaimerPlugin,
  ClaimerSourceFactory,
  CowSwapRouterPlugin,
  DrainBalanceSource,
  EqualRatioModel,
  MultiClaimerPlugin,
  MultiRouterPlugin,
  OmniModelFactory,
  OmniSourceFactory,
  RatioModel,
  RouterModelFactory,
  RouterPlugin,
  RouterSourceFactory,
  StreamBalanceSource,
} from '@artifacts/CapitalRouter'
import { Interface } from 'ethers'
import { type IReorgValidatorConfig } from './validators'
import {
  CapitalDistributorValidator,
  DaoRegistryValidator,
  ExecuteValidator,
  GaugeValidator,
  GovernanceErc20Validator,
  GovernanceVeValidator,
  LockManagerValidator,
  MetadataValidator,
  MultisigValidator,
  PermissionValidator,
  PluginRepoRegistryValidator,
  PluginSettingValidator,
  PluginSetupProcessorValidator,
  PolicyValidator,
  ProposalValidator,
} from './validators'

const ReorgEventConfig: IReorgValidatorConfig[] = [
  // historical and realtime on startup
  {
    event: 'PluginRepoRegistered',
    topic: new Interface(PluginRepoRegistry.abi).getEvent('PluginRepoRegistered')?.topicHash!,
    config: [
      {
        abi: PluginRepoRegistry.abi,
        validator: PluginRepoRegistryValidator.pluginRepoRegistered,
      },
    ],
  },
  {
    event: 'DAORegistered',
    topic: new Interface(DAORegistry.abi).getEvent('DAORegistered')?.topicHash!,
    config: [
      {
        abi: DAORegistry.abi,
        validator: DaoRegistryValidator.daoRegistered,
      },
    ],
  },
  {
    event: 'InstallationPrepared',
    topic: new Interface(PluginSetupProcessor.abi).getEvent('InstallationPrepared')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        validator: PluginSetupProcessorValidator.installationPrepared,
      },
    ],
  },
  {
    event: 'InstallationApplied',
    topic: new Interface(PluginSetupProcessor.abi).getEvent('InstallationApplied')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        validator: PluginSetupProcessorValidator.installationApplied,
      },
    ],
  },
  {
    event: 'UpdateApplied',
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UpdateApplied')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        validator: PluginSetupProcessorValidator.updateApplied,
      },
    ],
  },
  {
    event: 'UpdatePrepared',
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UpdatePrepared')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        validator: PluginSetupProcessorValidator.updatePrepared,
      },
    ],
  },
  {
    event: 'UninstallationApplied',
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UninstallationApplied')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        validator: PluginSetupProcessorValidator.uninstallationApplied,
      },
    ],
  },
  {
    event: 'UninstallationPrepared',
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UninstallationPrepared')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        validator: PluginSetupProcessorValidator.uninstallationPrepared,
      },
    ],
  },

  // only realtime on startup
  {
    event: 'MultisigSettingsUpdated',
    topic: new Interface(Multisig.abi).getEvent('MultisigSettingsUpdated')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        validator: PluginSettingValidator.multisigSettingsUpdated,
      },
      {
        abi: Multisig2.abi,
        validator: PluginSettingValidator.multisigSettingsUpdated,
      },
    ],
  },
  {
    event: 'VotingSettingsUpdated',
    topic: [
      new Interface(TokenVoting.abi).getEvent('VotingSettingsUpdated')?.topicHash!,
      new Interface(LockToVote.abi).getEvent('VotingSettingsUpdated')?.topicHash!,
    ],
    config: [
      {
        abi: TokenVoting.abi,
        validator: PluginSettingValidator.votingSettingsUpdated,
      },
      {
        abi: LockToVote.abi,
        validator: PluginSettingValidator.votingSettingsUpdated,
      },
    ],
  },
  {
    event: 'StagesUpdated',
    topic: new Interface(StagedProposalProcessor.abi).getEvent('StagesUpdated')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        validator: PluginSettingValidator.sppSettingsUpdated,
      },
    ],
  },
  {
    event: 'ProposalResultReported',
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalResultReported')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        validator: ProposalValidator.proposalResultReport,
      },
    ],
  },
  {
    event: 'MembersAdded',
    topic: new Interface(Multisig.abi).getEvent('MembersAdded')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        validator: MultisigValidator.membersAdded,
      },
    ],
  },
  {
    event: 'MembersRemoved',
    topic: new Interface(Multisig.abi).getEvent('MembersRemoved')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        validator: MultisigValidator.membersRemoved,
      },
    ],
  },
  {
    event: 'ProposalCreated',
    topic: new Interface(Multisig.abi).getEvent('ProposalCreated')?.topicHash!,
    config: [
      {
        abi: SharedLogs.abi,
        validator: ProposalValidator.proposalCreated,
      },
    ],
  },
  {
    event: 'ProposalExecuted',
    topic: new Interface(Multisig.abi).getEvent('ProposalExecuted')?.topicHash!,
    config: [
      {
        abi: SharedLogs.abi,
        validator: ProposalValidator.proposalExecuted,
      },
    ],
  },
  {
    event: 'ProposalCanceled',
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalCanceled')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        validator: ProposalValidator.proposalCanceled,
      },
    ],
  },
  {
    event: 'ProposalEdited',
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalEdited')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        validator: ProposalValidator.proposalEdited,
      },
    ],
  },
  {
    event: 'ProposalAdvanced',
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalAdvanced')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        validator: ProposalValidator.proposalAdvanced,
      },
    ],
  },
  {
    event: 'Approved',
    topic: new Interface(Multisig.abi).getEvent('Approved')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        validator: ProposalValidator.approved,
      },
    ],
  },
  {
    event: 'VoteCast',
    topic: new Interface(TokenVoting.abi).getEvent('VoteCast')?.topicHash!,
    config: [
      {
        abi: TokenVoting.abi,
        validator: ProposalValidator.voteCast,
      },
    ],
  },
  {
    event: 'MetadataSet',
    topic: new Interface(DAO.abi).getEvent('MetadataSet')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        validator: MetadataValidator.metadataSet,
      },
    ],
  },
  {
    event: 'DelegateVotesChanged',
    topic: new Interface(GovernanceERC20.abi).getEvent('DelegateVotesChanged')?.topicHash!,
    config: [
      {
        abi: GovernanceERC20.abi,
        validator: GovernanceErc20Validator.delegateVotesChanged,
      },
    ],
  },
  {
    event: 'NativeTokenDeposited',
    topic: new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        validator: DaoRegistryValidator.nativeTransfer,
      },
      {
        abi: DaoV2.abi,
        validator: DaoRegistryValidator.nativeTransfer,
      },
    ],
  },
  {
    event: 'Granted',
    topic: new Interface(DAO.abi).getEvent('Granted')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        validator: PermissionValidator.handleGrantOnDao,
      },
    ],
  },
  {
    event: 'Revoked',
    topic: new Interface(DAO.abi).getEvent('Revoked')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        validator: PermissionValidator.handleRevokeOnDao,
      },
    ],
  },

  // VE Governance events
  {
    event: 'Deposit',
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('Deposit')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        validator: GovernanceVeValidator.deposit,
      },
    ],
  },
  {
    event: 'Withdraw',
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('Withdraw')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        validator: GovernanceVeValidator.withdraw,
      },
    ],
  },
  {
    event: 'MinDepositSet',
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('MinDepositSet')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        validator: GovernanceVeValidator.minDepositSet,
      },
    ],
  },
  {
    event: 'Split',
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('Split')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        validator: GovernanceVeValidator.split,
      },
    ],
  },
  {
    event: 'Merged',
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('Merged')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        validator: GovernanceVeValidator.merge,
      },
    ],
  },
  {
    event: 'ExitQueued',
    topic: new Interface(ExitQueue.abi).getEvent('ExitQueued')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        validator: GovernanceVeValidator.exitQueued,
      },
    ],
  },
  {
    event: 'ExitQueuedV2',
    topic: new Interface(ExitQueue.abi).getEvent('ExitQueuedV2')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        validator: GovernanceVeValidator.exitQueued,
      },
    ],
  },
  {
    event: 'ExitCancelled',
    topic: new Interface(ExitQueue.abi).getEvent('ExitCancelled')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        validator: GovernanceVeValidator.exitCancelled,
      },
    ],
  },
  {
    event: 'MinLockSet',
    topic: new Interface(ExitQueue.abi).getEvent('MinLockSet')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        validator: GovernanceVeValidator.minLockSet,
      },
    ],
  },
  {
    event: 'ExitFeePercentAdjusted',
    topic: new Interface(ExitQueue.abi).getEvent('ExitFeePercentAdjusted')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        validator: PluginSettingValidator.exitFeePercentAdjusted,
      },
    ],
  },
  {
    event: 'TokensDelegated',
    topic: new Interface(VotingEscrow.abi).getEvent('TokensDelegated')?.topicHash!,
    config: [
      {
        abi: VotingEscrow.abi,
        validator: GovernanceVeValidator.delegateTokens,
      },
    ],
  },
  {
    event: 'TokensUndelegated',
    topic: new Interface(VotingEscrow.abi).getEvent('TokensUndelegated')?.topicHash!,
    config: [
      {
        abi: VotingEscrow.abi,
        validator: GovernanceVeValidator.unDelegateTokens,
      },
    ],
  },
  {
    event: 'SelectorAllowed',
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorAllowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        validator: ExecuteValidator.selectorAllowed,
      },
    ],
  },
  {
    event: 'SelectorDisallowed',
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorDisallowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        validator: ExecuteValidator.selectorDisallowed,
      },
    ],
  },
  {
    event: 'NativeTransfersAllowed',
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('NativeTransfersAllowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        validator: ExecuteValidator.nativeTransfersAllowed,
      },
    ],
  },
  {
    event: 'NativeTransfersDisallowed',
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('NativeTransfersDisallowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        validator: ExecuteValidator.nativeTransfersDisallowed,
      },
    ],
  },
  {
    event: 'BalanceLocked',
    topic: new Interface(LockManager.abi).getEvent('BalanceLocked')?.topicHash!,
    config: [
      {
        abi: LockManager.abi,
        validator: LockManagerValidator.balanceLocked,
      },
    ],
  },
  {
    event: 'BalanceUnlocked',
    topic: new Interface(LockManager.abi).getEvent('BalanceUnlocked')?.topicHash!,
    config: [
      {
        abi: LockManager.abi,
        validator: LockManagerValidator.balanceUnlocked,
      },
    ],
  },
  {
    event: 'VoteCleared',
    topic: new Interface(LockToVote.abi).getEvent('VoteCleared')?.topicHash!,
    config: [
      {
        abi: LockToVote.abi,
        validator: ProposalValidator.voteCleared,
      },
    ],
  },

  // Capital Distributor events
  {
    event: 'CampaignCreated',
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignCreated')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.campaignCreated,
      },
    ],
  },
  {
    event: 'PayoutClaimed',
    topic: new Interface(CapitalDistributor.abi).getEvent('PayoutClaimed')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.payoutClaimed,
      },
    ],
  },
  {
    event: 'CampaignPaused',
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignPaused')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.campaignPaused,
      },
    ],
  },
  {
    event: 'CampaignResumed',
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignResumed')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.campaignResumed,
      },
    ],
  },
  {
    event: 'CampaignEnded',
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignEnded')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.campaignEnded,
      },
    ],
  },
  {
    event: 'MerkleCampaignSet',
    topic: new Interface(CapitalDistributor.abi).getEvent('MerkleCampaignSet')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.merkleCampaignSet,
      },
    ],
  },
  {
    event: 'MerkleCampaignUpdated',
    topic: new Interface(CapitalDistributor.abi).getEvent('MerkleCampaignUpdated')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        validator: CapitalDistributorValidator.merkleCampaignUpdated,
      },
    ],
  },

  // Gauge
  {
    event: 'GaugeCreated',
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeCreated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        validator: GaugeValidator.gaugeCreated,
      },
    ],
  },
  {
    event: 'GaugeActivated',
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeActivated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        validator: GaugeValidator.gaugeActivated,
      },
    ],
  },
  {
    event: 'GaugeDeactivated',
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeDeactivated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        validator: GaugeValidator.gaugeDeactivated,
      },
    ],
  },
  {
    event: 'GaugeMetadataUpdated',
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeMetadataUpdated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        validator: GaugeValidator.gaugeUpdateMetadata,
      },
    ],
  },
  {
    event: 'Voted',
    topic: new Interface(GaugeVoter.abi).getEvent('Voted')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        validator: GaugeValidator.gaugeVoted,
      },
    ],
  },
  {
    event: 'Reset',
    topic: new Interface(GaugeVoter.abi).getEvent('Reset')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        validator: GaugeValidator.gaugeReset,
      },
    ],
  },

  // Policy Source/Model events
  {
    event: 'SourceSettingsUpdated',
    topic: [
      new Interface(StreamBalanceSource.abi).getEvent('SourceSettingsUpdated')?.topicHash!,
      new Interface(DrainBalanceSource.abi).getEvent('SourceSettingsUpdated')?.topicHash!,
    ],
    config: [
      {
        abi: StreamBalanceSource.abi,
        validator: PolicyValidator.streamSourceSettingsUpdated,
      },
      {
        abi: DrainBalanceSource.abi,
        validator: PolicyValidator.drainSourceSettingsUpdated,
      },
    ],
  },
  {
    event: 'PluginDefined',
    topic: new Interface(StreamBalanceSource.abi).getEvent('PluginDefined')?.topicHash!,
    config: [
      {
        abi: StreamBalanceSource.abi,
        validator: PolicyValidator.pluginDefined,
      },
    ],
  },
  {
    event: 'ModelSettingsUpdated',
    topic: [
      new Interface(RatioModel.abi).getEvent('ModelSettingsUpdated')?.topicHash!,
      new Interface(EqualRatioModel.abi).getEvent('ModelSettingsUpdated')?.topicHash!,
      new Interface(AddressGaugeRatioModel.abi).getEvent('ModelSettingsUpdated')?.topicHash!,
      new Interface(BracketsModel.abi).getEvent('ModelSettingsUpdated')?.topicHash!,
    ],
    config: [
      {
        abi: RatioModel.abi,
        validator: PolicyValidator.ratioModelSettingsUpdated,
      },
      {
        abi: EqualRatioModel.abi,
        validator: PolicyValidator.equalRatioModelSettingsUpdated,
      },
      {
        abi: AddressGaugeRatioModel.abi,
        validator: PolicyValidator.gaugeModelSettingsUpdated,
      },
      {
        abi: BracketsModel.abi,
        validator: PolicyValidator.bracketsModelSettingsUpdated,
      },
    ],
  },
  {
    event: 'RouterSettingsUpdated',
    topic: [
      new Interface(RouterPlugin.abi).getEvent('RouterSettingsUpdated')?.topicHash!,
      new Interface(MultiRouterPlugin.abi).getEvent('RouterSettingsUpdated')?.topicHash!,
      new Interface(CowSwapRouterPlugin.abi).getEvent('RouterSettingsUpdated')?.topicHash!,
    ],
    config: [
      {
        abi: RouterPlugin.abi,
        validator: PolicyValidator.routerSettingsUpdated,
      },
      {
        abi: MultiRouterPlugin.abi,
        validator: PolicyValidator.multiRouterSettingsUpdated,
      },
      {
        abi: CowSwapRouterPlugin.abi,
        validator: PolicyValidator.cowSwapRouterSettingsUpdated,
      },
    ],
  },
  {
    event: 'ClaimerSettingsUpdated',
    topic: [
      new Interface(ClaimerPlugin.abi).getEvent('ClaimerSettingsUpdated')?.topicHash!,
      new Interface(MultiClaimerPlugin.abi).getEvent('ClaimerSettingsUpdated')?.topicHash!,
    ],
    config: [
      {
        abi: ClaimerPlugin.abi,
        validator: PolicyValidator.claimerSettingsUpdated,
      },
      {
        abi: MultiClaimerPlugin.abi,
        validator: PolicyValidator.multiClaimerSettingsUpdated,
      },
    ],
  },

  // Policy Factory Deployment Events
  {
    event: 'DrainBalanceSourceDeployed',
    topic: new Interface(RouterSourceFactory.abi).getEvent('DrainBalanceSourceDeployed')?.topicHash!,
    config: [
      {
        abi: RouterSourceFactory.abi,
        validator: PolicyValidator.drainBalanceSourceDeployed,
      },
    ],
  },
  {
    event: 'RequiredBalanceSourceDeployed',
    topic: new Interface(RouterSourceFactory.abi).getEvent('RequiredBalanceSourceDeployed')?.topicHash!,
    config: [
      {
        abi: RouterSourceFactory.abi,
        validator: PolicyValidator.requiredBalanceSourceDeployed,
      },
    ],
  },
  {
    event: 'StreamBalanceSourceDeployed',
    topic: new Interface(OmniSourceFactory.abi).getEvent('StreamBalanceSourceDeployed')?.topicHash!,
    config: [
      {
        abi: OmniSourceFactory.abi,
        validator: PolicyValidator.streamBalanceSourceDeployed,
      },
    ],
  },
  {
    event: 'FixedBalanceSourceDeployed',
    topic: new Interface(ClaimerSourceFactory.abi).getEvent('FixedBalanceSourceDeployed')?.topicHash!,
    config: [
      {
        abi: ClaimerSourceFactory.abi,
        validator: PolicyValidator.fixedBalanceSourceDeployed,
      },
    ],
  },
  {
    event: 'RatioModelDeployed',
    topic: new Interface(RouterModelFactory.abi).getEvent('RatioModelDeployed')?.topicHash!,
    config: [
      {
        abi: RouterModelFactory.abi,
        validator: PolicyValidator.ratioModelDeployed,
      },
    ],
  },
  {
    event: 'EqualRatioModelDeployed',
    topic: new Interface(RouterModelFactory.abi).getEvent('EqualRatioModelDeployed')?.topicHash!,
    config: [
      {
        abi: RouterModelFactory.abi,
        validator: PolicyValidator.equalRatioModelDeployed,
      },
    ],
  },
  {
    event: 'BracketsModelDeployed',
    topic: new Interface(RouterModelFactory.abi).getEvent('BracketsModelDeployed')?.topicHash!,
    config: [
      {
        abi: RouterModelFactory.abi,
        validator: PolicyValidator.bracketsModelDeployed,
      },
    ],
  },
  {
    event: 'AddressGaugeRatioModelDeployed',
    topic: new Interface(OmniModelFactory.abi).getEvent('AddressGaugeRatioModelDeployed')?.topicHash!,
    config: [
      {
        abi: OmniModelFactory.abi,
        validator: PolicyValidator.addressGaugeRatioModelDeployed,
      },
    ],
  },
  {
    event: 'TokenGaugeRatioModelDeployed',
    topic: new Interface(OmniModelFactory.abi).getEvent('TokenGaugeRatioModelDeployed')?.topicHash!,
    config: [
      {
        abi: OmniModelFactory.abi,
        validator: PolicyValidator.tokenGaugeRatioModelDeployed,
      },
    ],
  },
]

export default ReorgEventConfig
