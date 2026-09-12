import AllowancesCheck from '@modules/proposalChecks/checks/assets/allowances'
import MintBurnCheck from '@modules/proposalChecks/checks/assets/mintBurn'
import NftsCheck from '@modules/proposalChecks/checks/assets/nfts'
import TransfersCheck from '@modules/proposalChecks/checks/assets/transfers'
import DecodeCheck from '@modules/proposalChecks/checks/execution/decode'
import DelegatecallCheck from '@modules/proposalChecks/checks/execution/delegatecall'
import NestedCheck from '@modules/proposalChecks/checks/execution/nested'
import SequenceCheck from '@modules/proposalChecks/checks/execution/sequence'
import ExecutionValidationCheck from '@modules/proposalChecks/checks/validation/execution'
import { type IAssessmentCheck } from '@types'

/** Every implemented check. A new check joins this list and nothing else. */
export const IMPLEMENTED_CHECKS: readonly IAssessmentCheck[] = [
  TransfersCheck,
  AllowancesCheck,
  NftsCheck,
  MintBurnCheck,
  NestedCheck,
  DecodeCheck,
  DelegatecallCheck,
  SequenceCheck,
  ExecutionValidationCheck,
]
