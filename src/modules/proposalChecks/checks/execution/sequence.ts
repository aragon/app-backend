import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFlatAction,
} from '@types'
import { Interface } from 'ethers'

export const SEQUENCE_CHECK_ID = 'execution/sequence'

/** The DAO's execute refuses more actions than this. */
const DAO_MAX_ACTIONS = 256

const UPGRADE_WRAPPERS = new Set(['upgradeToAndCall', 'upgradeAndCall'])

/**
 * Rule "Action sequence and failures". The simulation runs the actions in order; every DAO
 * execute along the way, the proposal's own and any nested one, reports through its Executed
 * event which of its actions failed, including the ones allowed to. A failed action anywhere,
 * an execute that never completed, a wrapper whose outcome cannot be read, or a sequence that
 * could not be tested at all is something a person has to look at.
 */
const SequenceCheck = {
  id: SEQUENCE_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const review = (reason: string): IAssessmentCheckResult => ({
      status: IAssessmentCheckStatus.NeedsReview,
      findings: [],
      reason,
    })

    const topLevel = ctx.captured.rawActions.length
    if (topLevel > DAO_MAX_ACTIONS) return review(`${topLevel} actions exceed the DAO limit of ${DAO_MAX_ACTIONS}`)

    const sim = ctx.simulation
    if (sim.status === 'unsupported' || sim.status === 'failed')
      return review(`action sequence not tested: ${sim.reason ?? sim.status}`)
    if (sim.status === 'reverted') return review(`execute reverted: ${sim.reason ?? 'no reason given'}`)

    const problems: string[] = []

    // An execute reports through its event when it completes, so nested executes report before
    // the one that contains them and the proposal's own reports last: the events come in the
    // post-order of the tree, and each layer is matched to the event at its position.
    const nested = ctx.actions.filter(a => a.nested === 'expanded' && SequenceCheck._isDaoExecute(a))
    const layers: Array<{ dao: string; path: string | null }> = [
      ...SequenceCheck._postOrder(nested).map(a => ({ dao: a.target, path: a.path })),
      { dao: ctx.request.daoAddress, path: null },
    ]
    const executions = [...sim.executions]
    if (executions.length !== layers.length) {
      problems.push(
        `the simulation reports ${executions.length} completed executes, the action tree has ${layers.length}`,
      )
    }
    for (const [position, layer] of layers.entries()) {
      const execution = executions[position]
      if (!execution) {
        problems.push(
          layer.path === null
            ? 'the simulation shows no completed execute on the DAO'
            : `inner execute at ${layer.path} did not complete`,
        )
        continue
      }
      if (execution.dao.toLowerCase() !== layer.dao.toLowerCase()) {
        const anywhere = executions.some(e => e.dao.toLowerCase() === layer.dao.toLowerCase())
        problems.push(
          !anywhere && layer.path === null
            ? 'the simulation shows no completed execute on the DAO'
            : !anywhere
              ? `inner execute at ${layer.path} did not complete`
              : `execute ${position + 1} in the simulation is on ${execution.dao}, the action tree expects ${layer.dao}${layer.path === null ? '' : ` at ${layer.path}`}`,
        )
        continue
      }
      const failed = SequenceCheck._failedIndexes(execution.failureMap, execution.actions)
      if (failed.length === 0) continue
      const allowed = new Set(SequenceCheck._failedIndexes(execution.allowFailureMap, execution.actions))
      const named = failed.map(i => {
        const at = layer.path === null ? `${i}` : `${layer.path}/${i}`
        return allowed.has(i) ? `${at} (allowed to fail, still failed)` : at
      })
      problems.push(`actions failed inside execute: ${named.join(', ')}`)
    }

    // Other wrappers report nothing about their inner calls; their outcome stays unknown. A
    // proxy upgrade's call fails with the upgrade itself, so it is read through its bit.
    const opaque = ctx.actions
      .filter(
        a => a.nested === 'expanded' && !SequenceCheck._isDaoExecute(a) && !UPGRADE_WRAPPERS.has(a.decoded?.name ?? ''),
      )
      .map(a => `${a.path} (${a.decoded?.name ?? a.selector})`)
    if (opaque.length) problems.push(`outcome of inner calls not verified at ${opaque.join(', ')}`)

    return problems.length === 0 ? { status: IAssessmentCheckStatus.Ok, findings: [] } : review(problems.join('; '))
  },

  /** Deeper paths first, siblings in order: the order in which nested executes complete. */
  _postOrder(actions: IAssessmentFlatAction[]): IAssessmentFlatAction[] {
    const parts = (p: string) => p.split('/').map(Number)
    return [...actions].sort((a, b) => {
      const x = parts(a.path)
      const y = parts(b.path)
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
      return y.length - x.length
    })
  },

  _isDaoExecute(action: IAssessmentFlatAction): boolean {
    return action.selector !== null && action.data.toLowerCase().startsWith(EXECUTE_SELECTOR)
  },

  _failedIndexes(bitmap: string, count: number): number[] {
    const bits = BigInt(bitmap || '0')
    const out: number[] = []
    for (let i = 0; i < count; i++) if ((bits >> BigInt(i)) & 1n) out.push(i)
    return out
  },
}

/** The DAO's execute, by selector, so a nested one is recognised whatever contract name it carries. */
const EXECUTE_SELECTOR = new Interface(['function execute(bytes32,(address,uint256,bytes)[],uint256)'])
  .getFunction('execute')!
  .selector.toLowerCase()

export default SequenceCheck
