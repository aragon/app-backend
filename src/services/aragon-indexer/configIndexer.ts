import { IEnumIndexerService, IIndexerConfig } from '@types'
import { DAORegistry } from '@artifacts/daoRegistry'
import { PluginSetupProcessor } from '@artifacts/pluginSetupProcessor'
import { PluginRepoRegistry } from '@artifacts/pluginRepoRegistry'
import { Multisig } from '@artifacts/Multisig'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { DaoRegistryHandler } from '@indexer/handlers/daoRegistryHandler'
import { PluginRepoRegistryHandler } from '@indexer/handlers/pluginRepoRegistryHandler'
import { MemberHandler } from '@indexer/handlers/memberHandler'
import {PluginSetupProcessorHandler} from "@indexer/handlers/pluginSetupProcessorHandler";
import {PluginSettingHandler} from "@indexer/handlers/pluginSettingHandler";
import {TokenVoting} from "@artifacts/TokenVoting";
import {DAO} from "@artifacts/dao";
import {MetadataHandler} from "@indexer/handlers/metadataHandler";
import {ProposalHandler} from "@indexer/handlers/proposalHandler";

const IndexerEventConfig: IIndexerConfig[] = [
  {
    name: IEnumIndexerService.logPluginRepoRegistry,
    abi: PluginRepoRegistry.abi,
    listen: [
      {
        event: 'PluginRepoRegistered',
        handler: PluginRepoRegistryHandler.pluginRepoRegistered,
        enabled: true,
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
        enabled: true,
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
        enabled: true,
      },
      {
        event: 'InstallationPrepared',
        handler: PluginSetupProcessorHandler.installationPrepared,
        enabled: true,
      },
      {
        event: 'UninstallationApplied',
        handler: PluginSetupProcessorHandler.uninstallationApplied,
        enabled: true,
      },
      {
        event: 'UninstallationPrepared',
        handler: PluginSetupProcessorHandler.uninstallationPrepared,
        enabled: true,
      },
      {
        event: 'UpdateApplied',
        handler: PluginSetupProcessorHandler.updateApplied,
        enabled: true,
      },
      {
        event: 'UpdatePrepared',
        handler: PluginSetupProcessorHandler.updatePrepared,
        enabled: true,
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
        enabled: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logPluginSettingMultisig,
    abi: Multisig.abi,
    listen: [
      {
        event: 'MultisigSettingsUpdated',
        handler: PluginSettingHandler.multisigSettingsUpdated,
        enabled: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logPluginSettingTokenVoting,
    abi: TokenVoting.abi,
    listen: [
      {
        event: 'VotingSettingsUpdated',
        handler: PluginSettingHandler.votingSettingsUpdated,
        enabled: true,
      },
    ],
    enabled: true,
  },
  {
    name: IEnumIndexerService.logProposal,
    abi: TokenVoting.abi,
    listen: [
      {
        event: 'VoteCast',
        handler: ProposalHandler.voteCast,
        enabled: true,
      },
      {
        event: 'ProposalCreated',
        handler: ProposalHandler.proposalCreated,
        enabled: true,
      },
      {
        event: 'ProposalExecuted',
        handler: ProposalHandler.proposalExecuted,
        enabled: true,
      },
    ],
    enabled: false,
  },
  {
    name: IEnumIndexerService.logProposalMultisig,
    abi: Multisig.abi,
    listen: [
      {
        event: 'Approved',
        handler: ProposalHandler.approved,
        enabled: true,
      },
    ],
    enabled: false,
  },

  {
    name: IEnumIndexerService.logMember,
    abi: Multisig.abi,
    listen: [
      {
        event: 'MembersAdded',
        handler: MemberHandler.membersAdded,
        enabled: true,
      },
      {
        event: 'MembersRemoved',
        handler: MemberHandler.membersRemoved,
        enabled: true,
      },
    ],
    enabled: false,
  },
  {
    name: IEnumIndexerService.logMemberGovernance,
    abi: GovernanceERC20.abi,
    listen: [
      {
        event: 'DelegateVotesChanged',
        handler: MemberHandler.delegateChanged,
        enabled: true,
      },
      {
        event: 'DelegateChanged',
        handler: MemberHandler.delegateChanged,
        enabled: true,
      },
    ],
    enabled: false,
  },
]

export default IndexerEventConfig
