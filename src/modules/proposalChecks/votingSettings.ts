import { Models } from '@dbModels'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import { type HexAddress, type IAssessmentFlatAction, type IVotingSettingsFacts } from '@types'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:votingSettings' })

export type IVotingSettingsPlugin = 'majority' | 'lockToVote' | 'multisig'

export interface IVotingSettingsCall {
  plugin: IVotingSettingsPlugin
  /** The proposed values, keyed by the update call's own field names, every value a string. */
  values: Record<string, string>
}

/** How the indexed settings record names each field of the update calls. */
const INDEXED_FIELD: Record<IVotingSettingsPlugin, Record<string, string>> = {
  majority: {
    votingMode: 'votingMode',
    supportThreshold: 'supportThreshold',
    minParticipation: 'minParticipation',
    minDuration: 'minDuration',
    minProposerVotingPower: 'minProposerVotingPower',
  },
  lockToVote: {
    votingMode: 'votingMode',
    supportThresholdRatio: 'supportThreshold',
    minParticipationRatio: 'minParticipation',
    minApprovalRatio: 'approvalThreshold',
    proposalDuration: 'minDuration',
    minProposerVotingPower: 'minProposerVotingPower',
  },
  multisig: { onlyListed: 'onlyListed', minApprovals: 'minApprovals' },
}

/**
 * Reads a governance settings update and the settings the plugin ran with at the evidence
 * block, from the indexed settings history. The three supported calls are told apart by
 * signature: the majority voting plugins (token and address list), lock-to-vote, and the
 * multisig.
 */
const VotingSettingsFacts = {
  callOf(action: IAssessmentFlatAction): IVotingSettingsCall | null {
    if (action.operation === 'delegatecall') return null
    const parsed = KnownAbi.parse(action.data)
    if (!parsed) return null
    const plugin: IVotingSettingsPlugin | null =
      parsed.name === 'updateMultisigSettings'
        ? 'multisig'
        : parsed.name !== 'updateVotingSettings'
          ? null
          : parsed.signature.includes('minApprovalRatio') ||
              parsed.fragment.inputs[0].components?.some(c => c.name === 'minApprovalRatio')
            ? 'lockToVote'
            : 'majority'
    if (!plugin) return null
    const tuple = parsed.args[0]
    const values: Record<string, string> = {}
    for (const field of Object.keys(INDEXED_FIELD[plugin])) values[field] = String(tuple[field])
    return { plugin, values }
  },

  async load(actions: readonly IAssessmentFlatAction[], block: number): Promise<Record<string, IVotingSettingsFacts>> {
    const facts: Record<string, IVotingSettingsFacts> = {}
    for (const action of actions) {
      const call = VotingSettingsFacts.callOf(action)
      if (!call) continue
      try {
        const setting = await Models.Setting.findLastSettingByBlockNumber(action.target as HexAddress, block)
        facts[action.path] = { before: setting ? VotingSettingsFacts._indexed(call.plugin, setting) : null }
      } catch (error) {
        logger.warn('proposal checks: settings before the update could not be read', llo({ path: action.path, error }))
      }
    }
    return facts
  },

  _indexed(plugin: IVotingSettingsPlugin, setting: Record<string, unknown>): Record<string, string> {
    const before: Record<string, string> = {}
    for (const [field, indexed] of Object.entries(INDEXED_FIELD[plugin])) {
      const value = setting[indexed]
      if (value !== undefined && value !== null) before[field] = String(value)
    }
    return before
  },
}

export default VotingSettingsFacts
