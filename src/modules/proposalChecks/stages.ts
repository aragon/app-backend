import { Models } from '@dbModels'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import { type HexAddress, type IAssessmentFlatAction, type IStageConfig, type IStagesFacts } from '@types'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:stages' })

/**
 * Reads a staged processor's stage update and the stages it ran with at the evidence block,
 * from the indexed settings history. Both sides take the same shape so the check compares
 * stage by stage.
 */
const StagesFacts = {
  /** The proposed stages, or null when the action is not a stage update. */
  callOf(action: IAssessmentFlatAction): IStageConfig[] | null {
    if (action.operation === 'delegatecall') return null
    const parsed = KnownAbi.parse(action.data)
    if (parsed?.name !== 'updateStages') return null
    return [...parsed.args._stages].map((stage: any) => ({
      bodies: [...stage.bodies].map((b: any) => String(b.addr)),
      minAdvance: stage.minAdvance.toString(),
      maxAdvance: stage.maxAdvance.toString(),
      voteDuration: stage.voteDuration.toString(),
      approvalThreshold: stage.approvalThreshold.toString(),
      vetoThreshold: stage.vetoThreshold.toString(),
      cancelable: Boolean(stage.cancelable),
      editable: Boolean(stage.editable),
    }))
  },

  async load(actions: readonly IAssessmentFlatAction[], block: number): Promise<Record<string, IStagesFacts>> {
    const facts: Record<string, IStagesFacts> = {}
    for (const action of actions) {
      if (!StagesFacts.callOf(action)) continue
      try {
        const setting = await Models.Setting.findLastSettingByBlockNumber(action.target as HexAddress, block)
        facts[action.path] = { before: setting?.stages?.length ? setting.stages.map(StagesFacts._indexed) : null }
      } catch (error) {
        logger.warn('proposal checks: stages before the update could not be read', llo({ path: action.path, error }))
      }
    }
    return facts
  },

  _indexed(stage: {
    plugins?: Array<{ address: string }>
    minAdvance?: number
    maxAdvance?: number
    voteDuration?: number
    approvalThreshold?: number
    vetoThreshold?: number
    cancelable?: boolean
    editable?: boolean
  }): IStageConfig {
    return {
      bodies: (stage.plugins ?? []).map(p => String(p.address)),
      minAdvance: String(stage.minAdvance ?? 0),
      maxAdvance: String(stage.maxAdvance ?? 0),
      voteDuration: String(stage.voteDuration ?? 0),
      approvalThreshold: String(stage.approvalThreshold ?? 0),
      vetoThreshold: String(stage.vetoThreshold ?? 0),
      cancelable: Boolean(stage.cancelable),
      editable: Boolean(stage.editable),
    }
  },
}

export default StagesFacts
