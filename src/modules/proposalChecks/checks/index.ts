import AllowancesCheck from '@modules/proposalChecks/checks/assets/allowances'
import CreatorContextCheck from '@modules/proposalChecks/checks/context/creator'
import MetadataCheck from '@modules/proposalChecks/checks/context/metadata'
import MintBurnCheck from '@modules/proposalChecks/checks/assets/mintBurn'
import NftsCheck from '@modules/proposalChecks/checks/assets/nfts'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import ComponentsCheck from '@modules/proposalChecks/checks/control/components'
import ConditionsCheck from '@modules/proposalChecks/checks/control/conditions'
import InitializerCheck from '@modules/proposalChecks/checks/control/initializer'
import OwnershipCheck from '@modules/proposalChecks/checks/control/ownership'
import PermissionsCheck from '@modules/proposalChecks/checks/control/permissions'
import PluginSetupCheck from '@modules/proposalChecks/checks/control/pluginSetup'
import UpgradeCheck from '@modules/proposalChecks/checks/control/upgrade'
import DecodeCheck from '@modules/proposalChecks/checks/execution/decode'
import DelegatecallCheck from '@modules/proposalChecks/checks/execution/delegatecall'
import NestedCheck from '@modules/proposalChecks/checks/execution/nested'
import SequenceCheck from '@modules/proposalChecks/checks/execution/sequence'
import ExecutionValidationCheck from '@modules/proposalChecks/checks/validation/execution'
import StagesValidationCheck from '@modules/proposalChecks/checks/validation/stages'
import VotingValidationCheck from '@modules/proposalChecks/checks/validation/voting'
import MembersCheck from '@modules/proposalChecks/checks/voting/members'
import ActionsChangedCheck from '@modules/proposalChecks/checks/voting/actionsChanged'
import VotingSettingsCheck from '@modules/proposalChecks/checks/voting/settings'
import StagesCheck from '@modules/proposalChecks/checks/voting/stages'
import { type IAssessmentCheck } from '@types'

/** Every implemented check. A new check joins this list and nothing else. */
export const IMPLEMENTED_CHECKS: readonly IAssessmentCheck[] = [
  TransfersCheck,
  AllowancesCheck,
  NftsCheck,
  MintBurnCheck,
  PermissionsCheck,
  ConditionsCheck,
  UpgradeCheck,
  InitializerCheck,
  PluginSetupCheck,
  ComponentsCheck,
  OwnershipCheck,
  VotingSettingsCheck,
  MembersCheck,
  StagesCheck,
  ActionsChangedCheck,
  NestedCheck,
  DecodeCheck,
  DelegatecallCheck,
  SequenceCheck,
  ExecutionValidationCheck,
  VotingValidationCheck,
  StagesValidationCheck,
  MetadataCheck,
  CreatorContextCheck,
]
