import { IEnumIndexerService, type IIndexerConfig } from '@types'
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

const IndexerEventConfig: IIndexerConfig[] = [
  // historical and realtime on startup
  {
    name: IEnumIndexerService.logPluginRepoRegistry,
    abi: PluginRepoRegistry.abi,
    listen: [
      {
        event: 'PluginRepoRegistered',
        handler: PluginRepoRegistryHandler.pluginRepoRegistered,
        enableHistorical: true,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logDaoRegistry,
    abi: DAORegistry.abi,
    listen: [
      {
        event: 'DAORegistered',
        handler: DaoRegistryHandler.daoRegistered,
        enableHistorical: true,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logPluginSetupProcessor,
    abi: PluginSetupProcessor.abi,
    listen: [
      {
        event: 'InstallationApplied',
        handler: PluginSetupProcessorHandler.installationApplied,
        enableHistorical: true,
        enableRealtime: true,
      },
      {
        event: 'InstallationPrepared',
        handler: PluginSetupProcessorHandler.installationPrepared,
        enableHistorical: true,
        enableRealtime: true,
      },
      {
        event: 'UninstallationApplied',
        handler: PluginSetupProcessorHandler.uninstallationApplied,
        enableHistorical: true,
        enableRealtime: true,
      },
      {
        event: 'UninstallationPrepared',
        handler: PluginSetupProcessorHandler.uninstallationPrepared,
        enableHistorical: true,
        enableRealtime: true,
      },
      {
        event: 'UpdateApplied',
        handler: PluginSetupProcessorHandler.updateApplied,
        enableHistorical: true,
        enableRealtime: true,
      },
      {
        event: 'UpdatePrepared',
        handler: PluginSetupProcessorHandler.updatePrepared,
        enableHistorical: true,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logMetadata,
    abi: DAO.abi,
    listen: [
      {
        event: 'MetadataSet',
        handler: MetadataHandler.metadataSet,
        enableHistorical: true,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },

  // only realtime on startup
  {
    name: IEnumIndexerService.logMultisig,
    abi: Multisig.abi,
    listen: [
      {
        event: 'MultisigSettingsUpdated',
        handler: PluginSettingHandler.multisigSettingsUpdated,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'Approved',
        handler: ProposalHandler.approved,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'MembersAdded',
        handler: MultisigHandler.membersAdded,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'MembersRemoved',
        handler: MultisigHandler.membersRemoved,
        enableHistorical: false,
        enableRealtime: true,
      },
      // those events will be handled by the plugin logTokenVoting as they have some interface
      // {
      //   event: 'ProposalCreated',
      //   handler: ProposalHandler.proposalCreated,
      //   enableHistorical: false,
      //   enableRealtime: true,
      // },
      // {
      //   event: 'ProposalExecuted',
      //   handler: ProposalHandler.proposalExecuted,
      //   enableHistorical: false,
      //   enableRealtime: true,
      // },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logTokenVoting,
    abi: TokenVoting.abi,
    listen: [
      {
        event: 'VotingSettingsUpdated',
        handler: PluginSettingHandler.votingSettingsUpdated,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'VoteCast',
        handler: ProposalHandler.voteCast,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'ProposalCreated',
        handler: ProposalHandler.proposalCreated,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'ProposalExecuted',
        handler: ProposalHandler.proposalExecuted,
        enableHistorical: false,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logGovernanceErc20,
    abi: GovernanceERC20.abi,
    listen: [
      {
        event: 'DelegateVotesChanged',
        handler: GovernanceErc20Handler.delegateVotesChanged,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'Transfer',
        handler: GovernanceErc20Handler.transfer,
        enableHistorical: false,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logStageProposalProcessor,
    abi: StagedProposalProcessor.abi,
    listen: [
      {
        event: 'StagesUpdated',
        handler: PluginSettingHandler.sppSettingsUpdated,
        enableHistorical: false,
        enableRealtime: true,
      },
      {
        event: 'ProposalAdvanced',
        handler: PluginSettingHandler.proposalAdvanced,
        enableHistorical: false,
        enableRealtime: true,
      },
    ],
    enabled: true,
  },
]

export default IndexerEventConfig
