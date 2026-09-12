import { assert } from '@errors'
import { type IAssessmentCheck } from '@types'

/**
 * Every rule in the source document that becomes a check, by id. The list is the contract with
 * the check manifest: a rule with no implemented check shows up as a coverage gap on each
 * assessment instead of silently not running.
 */
export const REQUIRED_CHECK_IDS = [
  'assets/transfers',
  'assets/allowances',
  'assets/nfts',
  'assets/mintBurn',
  'control/permissions',
  'control/conditions',
  'control/upgrade',
  'control/initializer',
  'control/pluginSetup',
  'control/components',
  'control/ownership',
  'voting/settings',
  'voting/members',
  'voting/stages',
  'voting/actionsChanged',
  'execution/decode',
  'execution/nested',
  'execution/delegatecall',
  'execution/sequence',
  'execution/crossChain',
  'validation/voting',
  'validation/stages',
  'validation/execution',
  'validation/completeness',
  'context/metadata',
  'context/creator',
  'context/relatedProposals',
] as const

export type IRequiredCheckId = (typeof REQUIRED_CHECK_IDS)[number]

const CheckRegistry = {
  /** Indexes a static list of checks by id, refusing ids outside the rule list or listed twice. */
  index(checks: readonly IAssessmentCheck[]): Map<string, IAssessmentCheck> {
    const byId = new Map<string, IAssessmentCheck>()
    for (const check of checks) {
      assert(REQUIRED_CHECK_IDS.includes(check.id as IRequiredCheckId), `Unknown check id ${check.id}`)
      assert(!byId.has(check.id), `Check ${check.id} listed twice`)
      byId.set(check.id, check)
    }
    return byId
  },

  coverage(byId: Map<string, IAssessmentCheck>): { implemented: string[]; missing: string[] } {
    return {
      implemented: REQUIRED_CHECK_IDS.filter(id => byId.has(id)),
      missing: REQUIRED_CHECK_IDS.filter(id => !byId.has(id)),
    }
  },
}

export default CheckRegistry
