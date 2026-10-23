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
import { type IAssessmentManifest } from '@types'

/**
 * Every rule of the source document that becomes a check, in the order they run. A rule that has
 * no check yet is listed as null, so it is reported as a coverage gap on each assessment instead
 * of silently not running. A new check replaces the null next to its rule and nothing else.
 */
export const CHECK_MANIFEST: IAssessmentManifest = [
  ['assets/transfers', TransfersCheck],
  ['assets/allowances', AllowancesCheck],
  ['assets/nfts', NftsCheck],
  ['assets/mintBurn', MintBurnCheck],
  ['control/permissions', PermissionsCheck],
  ['control/conditions', ConditionsCheck],
  ['control/upgrade', UpgradeCheck],
  ['control/initializer', InitializerCheck],
  ['control/pluginSetup', PluginSetupCheck],
  ['control/components', ComponentsCheck],
  ['control/ownership', OwnershipCheck],
  ['voting/settings', VotingSettingsCheck],
  ['voting/members', MembersCheck],
  ['voting/stages', StagesCheck],
  ['voting/actionsChanged', ActionsChangedCheck],
  ['execution/decode', DecodeCheck],
  ['execution/nested', NestedCheck],
  ['execution/delegatecall', DelegatecallCheck],
  ['execution/sequence', SequenceCheck],
  ['execution/crossChain', null],
  ['validation/voting', VotingValidationCheck],
  ['validation/stages', StagesValidationCheck],
  ['validation/execution', ExecutionValidationCheck],
  ['validation/completeness', null],
  ['context/metadata', MetadataCheck],
  ['context/creator', CreatorContextCheck],
  ['context/relatedProposals', null],
]
