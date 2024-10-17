import { Interface } from 'ethers'
import { type IIndexerConfig } from '@types'
import { DAORegistry } from '@artifacts/daoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'
import { Multisig } from '@artifacts/Multisig'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { DaoRegistryHandler } from '@indexer/handlers/daoRegistryHandler'
import { PluginRepoRegistryHandler } from '@indexer/handlers/pluginRepoRegistryHandler'
import { MultisigHandler } from '@indexer/handlers/multisigHandler'
import { PluginSetupProcessorHandler } from '@indexer/handlers/pluginSetupProcessorHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { TokenVoting } from '@artifacts/TokenVoting'
import { DAO } from '@artifacts/dao'
import { MetadataHandler } from '@indexer/handlers/metadataHandler'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { SharedLogs } from '@artifacts/shared'
import { PermissionHandler } from '@indexer/handlers/permissionHandler'

const IndexerEventConfig: IIndexerConfig[] = [
  // historical and realtime on startup
  {
    event: 'PluginRepoRegistered',
    abi: PluginRepoRegistry.abi,
    handler: PluginRepoRegistryHandler.pluginRepoRegistered,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginRepoRegistry.abi).getEvent('PluginRepoRegistered')?.topicHash!,
  },
  {
    event: 'DAORegistered',
    abi: DAORegistry.abi,
    handler: DaoRegistryHandler.daoRegistered,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(DAORegistry.abi).getEvent('DAORegistered')?.topicHash!,
  },
  {
    event: 'InstallationApplied',
    abi: PluginSetupProcessor.abi,
    handler: PluginSetupProcessorHandler.installationApplied,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('InstallationApplied')?.topicHash!,
  },
  {
    event: 'InstallationPrepared',
    abi: PluginSetupProcessor.abi,
    handler: PluginSetupProcessorHandler.installationPrepared,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('InstallationPrepared')?.topicHash!,
  },
  {
    event: 'UninstallationApplied',
    abi: PluginSetupProcessor.abi,
    handler: PluginSetupProcessorHandler.uninstallationApplied,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UninstallationApplied')?.topicHash!,
  },
  {
    event: 'UninstallationPrepared',
    abi: PluginSetupProcessor.abi,
    handler: PluginSetupProcessorHandler.uninstallationPrepared,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UninstallationPrepared')?.topicHash!,
  },
  {
    event: 'UpdateApplied',
    abi: PluginSetupProcessor.abi,
    handler: PluginSetupProcessorHandler.updateApplied,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UpdateApplied')?.topicHash!,
  },
  {
    event: 'UpdatePrepared',
    abi: PluginSetupProcessor.abi,
    handler: PluginSetupProcessorHandler.updatePrepared,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(PluginSetupProcessor.abi).getEvent('UpdatePrepared')?.topicHash!,
  },
  {
    event: 'MetadataSet',
    abi: DAO.abi,
    handler: MetadataHandler.metadataSet,
    enableHistorical: true,
    enableRealtime: true,
    topic: new Interface(DAO.abi).getEvent('MetadataSet')?.topicHash!,
  },

  // only realtime on startup
  {
    event: 'MultisigSettingsUpdated',
    abi: Multisig.abi,
    handler: PluginSettingHandler.multisigSettingsUpdated,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(Multisig.abi).getEvent('MultisigSettingsUpdated')?.topicHash!,
  },
  {
    event: 'Approved',
    abi: Multisig.abi,
    handler: ProposalHandler.approved,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(Multisig.abi).getEvent('Approved')?.topicHash!,
  },
  {
    event: 'MembersAdded',
    abi: Multisig.abi,
    handler: MultisigHandler.membersAdded,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(Multisig.abi).getEvent('MembersAdded')?.topicHash!,
  },
  {
    event: 'MembersRemoved',
    abi: Multisig.abi,
    handler: MultisigHandler.membersRemoved,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(Multisig.abi).getEvent('MembersRemoved')?.topicHash!,
  },
  {
    event: 'ProposalCreated',
    abi: SharedLogs.abi,
    handler: ProposalHandler.proposalCreated,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(Multisig.abi).getEvent('ProposalCreated')?.topicHash!,
  },
  {
    event: 'ProposalExecuted',
    abi: SharedLogs.abi,
    handler: ProposalHandler.proposalExecuted,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(Multisig.abi).getEvent('ProposalExecuted')?.topicHash!,
  },
  {
    event: 'VotingSettingsUpdated',
    abi: TokenVoting.abi,
    handler: PluginSettingHandler.votingSettingsUpdated,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(TokenVoting.abi).getEvent('VotingSettingsUpdated')?.topicHash!,
  },
  {
    event: 'VoteCast',
    abi: TokenVoting.abi,
    handler: ProposalHandler.voteCast,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(TokenVoting.abi).getEvent('VoteCast')?.topicHash!,
  },
  {
    event: 'DelegateVotesChanged',
    abi: GovernanceERC20.abi,
    handler: GovernanceErc20Handler.delegateVotesChanged,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(GovernanceERC20.abi).getEvent('DelegateVotesChanged')?.topicHash!,
  },
  {
    event: 'Transfer',
    abi: GovernanceERC20.abi,
    handler: GovernanceErc20Handler.transfer,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
  },
  {
    event: 'StagesUpdated',
    abi: StagedProposalProcessor.abi,
    handler: PluginSettingHandler.sppSettingsUpdated,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('StagesUpdated')?.topicHash!,
  },
  {
    event: 'ProposalAdvanced',
    abi: StagedProposalProcessor.abi,
    handler: ProposalHandler.proposalAdvanced,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(StagedProposalProcessor.abi).getEvent('ProposalAdvanced')?.topicHash!,
  },
  {
    event: 'Granted',
    abi: DAO.abi,
    handler: PermissionHandler.handleGrantOnDao,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(DAO.abi).getEvent('Grant')?.topicHash!,
  },
  {
    event: 'Revoked',
    abi: DAO.abi,
    handler: PermissionHandler.handleRevokeOnDao,
    enableHistorical: false,
    enableRealtime: true,
    topic: new Interface(DAO.abi).getEvent('Revoke')?.topicHash!,
  },
]

export default IndexerEventConfig
