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
import { LockERC721 } from '@artifacts/LockERC721'

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
    topic: new Interface(TokenVoting.abi).getEvent('VotingSettingsUpdated')?.topicHash!,
    config: [
      {
        abi: TokenVoting.abi,
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
    event: 'Transfer',
    enableHistorical: false,
    topic: new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
    config: [
      {
        abi: GovernanceERC20.abi,
        handler: GovernanceErc20Handler.transfer,
      },
      {
        abi: LockERC721.abi,
        handler: GovernanceErc20Handler.transfer,
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
]

export default IndexerEventConfig
