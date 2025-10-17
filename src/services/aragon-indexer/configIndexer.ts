import { Interface } from 'ethers'
import { type IIndexerConfig } from '@types'
import { DAORegistry } from '@artifacts/daoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'
import { Multisig } from '@artifacts/Multisig'
import { Multisig2 } from '@artifacts/Multisig2'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { PluginRepoRegistryHandler } from '@src/handlers/pluginRepoRegistryHandler'
import { MultisigHandler } from '@src/handlers/multisigHandler'
import { PluginSetupProcessorHandler } from '@src/handlers/pluginSetupProcessorHandler'
import { PluginSettingHandler } from '@src/handlers/pluginSettingHandler'
import { TokenVoting } from '@artifacts/TokenVoting'
import { DAO } from '@artifacts/dao'
import { MetadataHandler } from '@src/handlers/metadataHandler'
import { ProposalHandler } from '@src/handlers/proposalHandler'
import { GovernanceErc20Handler } from '@src/handlers/governanceErc20Handler'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { SharedLogs } from '@artifacts/shared'
import { PermissionHandler } from '@src/handlers/permissionHandler'
import { DaoRegistryHandler } from '@src/handlers/daoRegistryHandler'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { GovernanceVeHandler } from '@handlers/governanceVeHandler'
import { ExitQueue } from '@artifacts/ExitQueue'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { DaoV2 } from '@artifacts/daoV2'
import { ExecuteSelectorCondition } from '@artifacts/ExecuteSelectorCondition'
import { ExecuteHandler } from '@handlers/executeHandler'
import LockManagerHandler from '@handlers/lockManagerHandler'
import { LockManager } from '@artifacts/LockManager'
import { LockToVote } from '@artifacts/LockToVote'
import { CapitalDistributor } from '@artifacts/CapitalDistributor'
import { CapitalDistributorHandler } from '@handlers/capitalDistributorHandler'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { GaugeHandler } from '@handlers/gaugeHandler'

const IndexerEventConfig: IIndexerConfig[] = [
  // historical and realtime on startup
  {
    event: 'PluginRepoRegistered',
    enableHistorical: true,
    topic: new Interface(PluginRepoRegistry.abi).getEvent('PluginRepoRegistered')?.topicHash!,
    config: [
      {
        abi: PluginRepoRegistry.abi,
        handler: PluginRepoRegistryHandler.pluginRepoRegistered,
      },
    ],
  },
  {
    event: 'DAORegistered',
    enableHistorical: true,
    topic: new Interface(DAORegistry.abi).getEvent('DAORegistered')?.topicHash!,
    config: [
      {
        abi: DAORegistry.abi,
        handler: DaoRegistryHandler.daoRegistered,
      },
    ],
  },
  {
    event: 'InstallationPrepared',
    enableHistorical: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('InstallationPrepared')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        handler: PluginSetupProcessorHandler.installationPrepared,
      },
    ],
  },
  {
    event: 'InstallationApplied',
    enableHistorical: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('InstallationApplied')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        handler: PluginSetupProcessorHandler.installationApplied,
      },
    ],
  },
  {
    event: 'UpdateApplied',
    enableHistorical: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UpdateApplied')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        handler: PluginSetupProcessorHandler.updateApplied,
      },
    ],
  },
  {
    event: 'UpdatePrepared',
    enableHistorical: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UpdatePrepared')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        handler: PluginSetupProcessorHandler.updatePrepared,
      },
    ],
  },
  {
    event: 'UninstallationApplied',
    enableHistorical: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UninstallationApplied')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        handler: PluginSetupProcessorHandler.uninstallationApplied,
      },
    ],
  },
  {
    event: 'UninstallationPrepared',
    enableHistorical: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UninstallationPrepared')?.topicHash!,
    config: [
      {
        abi: PluginSetupProcessor.abi,
        handler: PluginSetupProcessorHandler.uninstallationPrepared,
      },
    ],
  },

  // only realtime on startup
  {
    event: 'MultisigSettingsUpdated',
    enableHistorical: false,
    topic: new Interface(Multisig.abi).getEvent('MultisigSettingsUpdated')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        handler: PluginSettingHandler.multisigSettingsUpdated,
      },
      {
        abi: Multisig2.abi,
        handler: PluginSettingHandler.multisigSettingsUpdated,
      },
    ],
  },
  {
    event: 'VotingSettingsUpdated',
    enableHistorical: false,
    topic: [
      new Interface(TokenVoting.abi).getEvent('VotingSettingsUpdated')?.topicHash!,
      new Interface(LockToVote.abi).getEvent('VotingSettingsUpdated')?.topicHash!,
    ],
    config: [
      {
        abi: TokenVoting.abi,
        handler: PluginSettingHandler.votingSettingsUpdated,
      },
      {
        abi: LockToVote.abi,
        handler: PluginSettingHandler.votingSettingsUpdated,
      },
    ],
  },
  {
    event: 'StagesUpdated',
    enableHistorical: false,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('StagesUpdated')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        handler: PluginSettingHandler.sppSettingsUpdated,
      },
    ],
  },
  {
    event: 'ProposalResultReported',
    enableHistorical: false,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalResultReported')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        handler: ProposalHandler.proposalResultReport,
      },
    ],
  },
  {
    event: 'MembersAdded',
    enableHistorical: false,
    topic: new Interface(Multisig.abi).getEvent('MembersAdded')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        handler: MultisigHandler.membersAdded,
      },
    ],
  },
  {
    event: 'MembersRemoved',
    enableHistorical: false,
    topic: new Interface(Multisig.abi).getEvent('MembersRemoved')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        handler: MultisigHandler.membersRemoved,
      },
    ],
  },
  {
    event: 'ProposalCreated',
    enableHistorical: false,
    topic: new Interface(Multisig.abi).getEvent('ProposalCreated')?.topicHash!,
    config: [
      {
        abi: SharedLogs.abi,
        handler: ProposalHandler.proposalCreated,
      },
    ],
  },
  {
    event: 'ProposalExecuted',
    enableHistorical: false,
    topic: new Interface(Multisig.abi).getEvent('ProposalExecuted')?.topicHash!,
    config: [
      {
        abi: SharedLogs.abi,
        handler: ProposalHandler.proposalExecuted,
      },
    ],
  },
  {
    event: 'ProposalCanceled',
    enableHistorical: false,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalCanceled')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        handler: ProposalHandler.proposalCanceled,
      },
    ],
  },
  {
    event: 'ProposalEdited',
    enableHistorical: false,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalEdited')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        handler: ProposalHandler.proposalEdited,
      },
    ],
  },
  {
    event: 'ProposalAdvanced',
    enableHistorical: false,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalAdvanced')?.topicHash!,
    config: [
      {
        abi: StagedProposalProcessor.abi,
        handler: ProposalHandler.proposalAdvanced,
      },
    ],
  },
  {
    event: 'Approved',
    enableHistorical: false,
    topic: new Interface(Multisig.abi).getEvent('Approved')?.topicHash!,
    config: [
      {
        abi: Multisig.abi,
        handler: ProposalHandler.approved,
      },
    ],
  },
  {
    event: 'VoteCast',
    enableHistorical: false,
    topic: new Interface(TokenVoting.abi).getEvent('VoteCast')?.topicHash!,
    config: [
      {
        abi: TokenVoting.abi,
        handler: ProposalHandler.voteCast,
      },
    ],
  },
  {
    event: 'MetadataSet',
    enableHistorical: true,
    topic: new Interface(DAO.abi).getEvent('MetadataSet')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        handler: MetadataHandler.metadataSet,
      },
    ],
  },
  {
    event: 'DelegateVotesChanged',
    enableHistorical: false,
    topic: new Interface(GovernanceERC20.abi).getEvent('DelegateVotesChanged')?.topicHash!,
    config: [
      {
        abi: GovernanceERC20.abi,
        handler: GovernanceErc20Handler.delegateVotesChanged,
      },
    ],
  },
  {
    event: 'NativeTokenDeposited',
    enableHistorical: false,
    topic: new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        handler: DaoRegistryHandler.nativeTransfer,
      },
      {
        abi: DaoV2.abi,
        handler: DaoRegistryHandler.nativeTransfer,
      },
    ],
  },
  {
    event: 'Granted',
    enableHistorical: false,
    topic: new Interface(DAO.abi).getEvent('Granted')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        handler: PermissionHandler.handleGrantOnDao,
      },
    ],
  },
  {
    event: 'Revoked',
    enableHistorical: false,
    topic: new Interface(DAO.abi).getEvent('Revoked')?.topicHash!,
    config: [
      {
        abi: DAO.abi,
        handler: PermissionHandler.handleRevokeOnDao,
      },
    ],
  },

  // VE Governance events
  {
    event: 'Deposit',
    enableHistorical: false,
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('Deposit')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        handler: GovernanceVeHandler.deposit,
      },
    ],
  },
  {
    event: 'Withdraw',
    enableHistorical: false,
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('Withdraw')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        handler: GovernanceVeHandler.withdraw,
      },
    ],
  },
  {
    event: 'MinDepositSet',
    enableHistorical: false,
    topic: new Interface(VotingEscrowIncreasing.abi).getEvent('MinDepositSet')?.topicHash!,
    config: [
      {
        abi: VotingEscrowIncreasing.abi,
        handler: GovernanceVeHandler.minDepositSet,
      },
    ],
  },
  {
    event: 'ExitQueued',
    enableHistorical: false,
    topic: new Interface(ExitQueue.abi).getEvent('ExitQueued')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        handler: GovernanceVeHandler.exitQueued,
      },
    ],
  },
  {
    event: 'ExitQueuedV2',
    enableHistorical: false,
    topic: new Interface(ExitQueue.abi).getEvent('ExitQueuedV2')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        handler: GovernanceVeHandler.exitQueued,
      },
    ],
  },
  {
    event: 'MinLockSet',
    enableHistorical: false,
    topic: new Interface(ExitQueue.abi).getEvent('MinLockSet')?.topicHash!,
    config: [
      {
        abi: ExitQueue.abi,
        handler: GovernanceVeHandler.minLockSet,
      },
    ],
  },
  {
    event: 'TokensDelegated',
    enableHistorical: false,
    topic: new Interface(VotingEscrow.abi).getEvent('TokensDelegated')?.topicHash!,
    config: [
      {
        abi: VotingEscrow.abi,
        handler: GovernanceVeHandler.delegateTokens,
      },
    ],
  },
  {
    event: 'TokensUndelegated',
    enableHistorical: false,
    topic: new Interface(VotingEscrow.abi).getEvent('TokensUndelegated')?.topicHash!,
    config: [
      {
        abi: VotingEscrow.abi,
        handler: GovernanceVeHandler.unDelegateTokens,
      },
    ],
  },
  {
    event: 'SelectorAllowed',
    enableHistorical: false,
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorAllowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        handler: ExecuteHandler.selectorAllowed,
      },
    ],
  },
  {
    event: 'SelectorDisallowed',
    enableHistorical: false,
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('SelectorDisallowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        handler: ExecuteHandler.selectorDisallowed,
      },
    ],
  },
  {
    event: 'NativeTransfersAllowed',
    enableHistorical: false,
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('NativeTransfersAllowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        handler: ExecuteHandler.nativeTransfersAllowed,
      },
    ],
  },
  {
    event: 'NativeTransfersDisallowed',
    enableHistorical: false,
    topic: new Interface(ExecuteSelectorCondition.abi).getEvent('NativeTransfersDisallowed')?.topicHash!,
    config: [
      {
        abi: ExecuteSelectorCondition.abi,
        handler: ExecuteHandler.nativeTransfersDisallowed,
      },
    ],
  },
  {
    event: 'BalanceLocked',
    enableHistorical: false,
    topic: new Interface(LockManager.abi).getEvent('BalanceLocked')?.topicHash!,
    config: [
      {
        abi: LockManager.abi,
        handler: LockManagerHandler.balanceLocked,
      },
    ],
  },
  {
    event: 'BalanceUnlocked',
    enableHistorical: false,
    topic: new Interface(LockManager.abi).getEvent('BalanceUnlocked')?.topicHash!,
    config: [
      {
        abi: LockManager.abi,
        handler: LockManagerHandler.balanceUnlocked,
      },
    ],
  },
  {
    event: 'VoteCleared',
    enableHistorical: false,
    topic: new Interface(LockToVote.abi).getEvent('VoteCleared')?.topicHash!,
    config: [
      {
        abi: LockToVote.abi,
        handler: ProposalHandler.voteCleared,
      },
    ],
  },

  // Capital Distributor events
  {
    event: 'CampaignCreated',
    enableHistorical: true,
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignCreated')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.campaignCreated,
      },
    ],
  },
  {
    event: 'PayoutClaimed',
    enableHistorical: false,
    topic: new Interface(CapitalDistributor.abi).getEvent('PayoutClaimed')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.payoutClaimed,
      },
    ],
  },
  {
    event: 'CampaignPaused',
    enableHistorical: false,
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignPaused')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.campaignPaused,
      },
    ],
  },
  {
    event: 'CampaignResumed',
    enableHistorical: false,
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignResumed')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.campaignResumed,
      },
    ],
  },
  {
    event: 'CampaignEnded',
    enableHistorical: false,
    topic: new Interface(CapitalDistributor.abi).getEvent('CampaignEnded')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.campaignEnded,
      },
    ],
  },
  {
    event: 'MerkleCampaignSet',
    enableHistorical: false,
    topic: new Interface(CapitalDistributor.abi).getEvent('MerkleCampaignSet')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.merkleCampaignSet,
      },
    ],
  },
  {
    event: 'MerkleCampaignUpdated',
    enableHistorical: false,
    topic: new Interface(CapitalDistributor.abi).getEvent('MerkleCampaignUpdated')?.topicHash!,
    config: [
      {
        abi: CapitalDistributor.abi,
        handler: CapitalDistributorHandler.merkleCampaignUpdated,
      },
    ],
  },
  // Gauge
  {
    event: 'GaugeCreated',
    enableHistorical: false,
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeCreated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        handler: GaugeHandler.gaugeCreated,
      },
    ],
  },
  {
    event: 'GaugeActivated',
    enableHistorical: false,
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeActivated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        handler: GaugeHandler.gaugeActivated,
      },
    ],
  },
  {
    event: 'GaugeDeactivated',
    enableHistorical: false,
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeDeactivated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        handler: GaugeHandler.gaugeDeactivated,
      },
    ],
  },
  {
    event: 'GaugeMetadataUpdated',
    enableHistorical: false,
    topic: new Interface(GaugeVoter.abi).getEvent('GaugeMetadataUpdated')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        handler: GaugeHandler.gaugeUpdateMetadata,
      },
    ],
  },
  {
    event: 'Voted',
    enableHistorical: false,
    topic: new Interface(GaugeVoter.abi).getEvent('Voted')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        handler: GaugeHandler.gaugeVoted,
      },
    ],
  },
  {
    event: 'Reset',
    enableHistorical: false,
    topic: new Interface(GaugeVoter.abi).getEvent('Reset')?.topicHash!,
    config: [
      {
        abi: GaugeVoter.abi,
        handler: GaugeHandler.gaugeReset,
      },
    ],
  },
]

export default IndexerEventConfig
