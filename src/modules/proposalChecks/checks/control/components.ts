import ComponentFacts, { type IComponentCall } from '@modules/proposalChecks/components'
import PermissionState, { ANY_ADDR, type IPermissionOp } from '@modules/proposalChecks/permissions'
import { nameOf } from '@modules/proposalChecks/naming'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  type IAssessmentFindingLabel,
  IAssessmentSeverity,
  type IComponentFacts,
} from '@types'

export const COMPONENTS_CHECK_ID = 'control/components'

const ZERO = '0x0000000000000000000000000000000000000000'
const VALIDATE_SIGNATURE = PermissionState.idOf('VALIDATE_SIGNATURE_PERMISSION')

/**
 * Modules whose verified name says what they restrict; any other module is taken as unrestricted.
 * The name is matched by its start, since these ship under names like Delay, DelayModifier,
 * Roles and Roles_v2.
 */
const SAFEGUARD_MODULES = [
  { kind: 'Delay', match: /^delay/i, says: 'a Delay only queues transactions and executes them after its cooldown' },
  { kind: 'Roles', match: /^roles/i, says: 'a Roles module only forwards what its roles allow' },
]
const safeguardOf = (name: string | null) => (name ? (SAFEGUARD_MODULES.find(s => s.match.test(name)) ?? null) : null)

/** The callbacks a DAO commonly registers, by interface id and by callback selector. */
const KNOWN_CALLBACKS: Record<string, string> = {
  '0x150b7a02': 'accepts ERC-721 transfers',
  '0x4e2312e0': 'accepts ERC-1155 transfers',
  '0xf23a6e61': 'accepts single ERC-1155 transfers',
  '0xbc197c81': 'accepts batch ERC-1155 transfers',
}

interface IGraded {
  kind: IAssessmentFindingKind
  severity?: IAssessmentSeverity
  /** `protectionReduced` when a veto or delay safeguard is weakened; the veto rule is this label, not a check of its own. */
  labels?: IAssessmentFindingLabel[]
  title: string
  details: string[]
  limits?: string[]
}

/**
 * Rule "Components that act with the DAO's authority". The trusted forwarder on the DAO or a
 * plugin, the DAO's callback registry, the legacy signature validator, the VALIDATE_SIGNATURE
 * grants that replaced it, a plugin's target config, and the modules, guards and Delay settings
 * of a Safe the DAO acts through. What a new component can do is read from what it is, not from
 * its address: the verified name of the contract tells a Delay or a Roles module, which only
 * delay or scope, from anything else, which executes with no signatures.
 */
const ComponentsCheck = {
  id: COMPONENTS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      const call = ComponentFacts.callOf(action)
      if (call)
        findings.push(ComponentsCheck._finding(action.path, ComponentsCheck._grade(action, call, ctx), { call }))
    }
    const dao = ctx.request.daoAddress
    const ops = ctx.actions
      .filter(a => a.operation !== 'delegatecall' && a.target === dao && PermissionState.isPermissionCall(a))
      .flatMap(a => PermissionState.opsOf(a))
      .filter(op => op.permissionId.toLowerCase() === VALIDATE_SIGNATURE && op.where === dao)
    for (const op of ops) findings.push(ComponentsCheck._finding(op.path, ComponentsCheck._signatureGrant(op), op))
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _grade(action: IAssessmentFlatAction, call: IComponentCall, ctx: Readonly<IAssessmentContext>): IGraded {
    const facts = ctx.components[action.path] ?? null
    const graded = ComponentsCheck._gradeCall(action, call, facts, ctx)
    const limits = [
      ...(graded.limits ?? []),
      ...(facts ? [] : ['the component in place before the action could not be read']),
    ]
    return { ...graded, limits }
  },

  _gradeCall(
    action: IAssessmentFlatAction,
    call: IComponentCall,
    facts: IComponentFacts | null,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    switch (call.kind) {
      case 'forwarder':
        return ComponentsCheck._forwarder(action, call.forwarder, facts?.targetName ?? null, facts?.before ?? null, ctx)
      case 'callback':
        return ComponentsCheck._callback(action, call, ctx)
      case 'validator':
        return ComponentsCheck._validator(action, call.validator, ctx)
      case 'targetConfig':
        return ComponentsCheck._targetConfig(action, call, facts?.installedName ?? null, facts?.before ?? null, ctx)
      case 'module':
        return ComponentsCheck._module(action, call, facts, ctx)
      case 'guard':
        return ComponentsCheck._guard(action, call.guard, facts?.targetName ?? null, facts?.installedName ?? null, ctx)
      case 'delayCooldown':
      case 'delayExpiration':
      case 'delayNonce':
      case 'delaySkip':
        return ComponentsCheck._delay(action, call, facts?.targetName ?? null, facts?.before ?? null, ctx)
    }
  },

  /**
   * A module executes from its avatar with no signatures. Only the module's own answer changes
   * that: a contract that reports a cooldown queues what it runs, so it delays rather than
   * executes at once. A name that reads like a safeguard is a claim, not evidence, and leaves
   * the addition for a person to look at. Everything else, the DAO included, is Critical.
   */
  _module(
    action: IAssessmentFlatAction,
    call: Extract<IComponentCall, { kind: 'module' }>,
    facts: IComponentFacts | null,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const installedName = facts?.installedName ?? null
    const cooldown = facts?.installedCooldown ?? null
    const subject = nameOf(action.target, ctx, facts?.targetName ?? null)
    const who = nameOf(call.module, ctx, installedName)
    const queues = cooldown !== null && BigInt(cooldown) > 0n
    const claimed = safeguardOf(installedName)

    if (!call.enabled) {
      if (queues) {
        return {
          kind: IAssessmentFindingKind.Risk,
          severity: IAssessmentSeverity.High,
          labels: ['protectionReduced'],
          title: `Removes the module ${who} from ${subject}`,
          details: [`it queued transactions for ${cooldown} seconds; without it ${subject} loses that safeguard`],
        }
      }
      if (claimed) {
        return {
          kind: IAssessmentFindingKind.Change,
          labels: ['protectionReduced'],
          title: `Removes the ${installedName} module ${call.module} from ${subject}`,
          details: [`${claimed.says}; without it ${subject} loses what it restricted`],
          limits: ['the module was not asked what it restricts, so the name is all there is'],
        }
      }
      return {
        kind: IAssessmentFindingKind.Change,
        title: `Removes module ${who} from ${subject}`,
        details: [`${who} can no longer execute from ${subject}`],
        limits: installedName ? [] : ['what the removed module could do is not read'],
      }
    }

    if (queues) {
      return {
        kind: IAssessmentFindingKind.Change,
        title: `Adds the module ${who} to ${subject}`,
        details: [`it queues what it is asked to run and executes it ${cooldown} seconds later`],
      }
    }
    const details = [`${who} can execute any transaction from ${subject} with no signatures`]
    if (safeguardOf(facts?.targetName ?? null)?.kind === 'Delay') {
      const zeroed = ctx.actions.some(a => {
        const c = ComponentFacts.callOf(a)
        return c?.kind === 'delayCooldown' && c.seconds === '0' && a.target === action.target
      })
      details.push(
        zeroed
          ? 'the same batch sets the cooldown to zero, so nothing delays it'
          : 'each transaction still waits out the cooldown of the Delay',
      )
    }
    if (claimed) {
      return {
        kind: IAssessmentFindingKind.NeedsReview,
        title: `Adds the ${installedName} module ${call.module} to ${subject}`,
        details: [...details, `the name says ${claimed.says}, which the contract itself did not confirm`],
        limits: [
          cooldown === '0'
            ? 'the module reports a cooldown of zero, so it queues nothing'
            : 'the module answered no cooldown, so nothing narrower than full execution is established',
        ],
      }
    }
    return {
      kind: IAssessmentFindingKind.Risk,
      severity: IAssessmentSeverity.Critical,
      title: `Adds module ${who} to ${subject}`,
      details,
      limits: installedName
        ? []
        : ['the module has no verified source, so nothing narrower than full execution is established'],
    }
  },

  _guard(
    action: IAssessmentFlatAction,
    guard: string,
    targetName: string | null,
    installedName: string | null,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const subject = nameOf(action.target, ctx, targetName)
    if (guard === ZERO) {
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.High,
        labels: ['protectionReduced'],
        title: `Removes the guard of ${subject}`,
        details: ['no contract checks its transactions before and after execution any more'],
      }
    }
    return {
      kind: IAssessmentFindingKind.Change,
      title: `Sets the guard of ${subject} to ${nameOf(guard, ctx, installedName)}`,
      details: ['the guard can block transactions of the Safe'],
      limits: ['what the guard blocks is not read'],
    }
  },

  /** The Delay's cooldown is the safeguard; zero or shorter means less time to veto. Expiration, nonce and skipping only shape the queue. */
  _delay(
    action: IAssessmentFlatAction,
    call: Extract<IComponentCall, { kind: 'delayCooldown' | 'delayExpiration' | 'delayNonce' | 'delaySkip' }>,
    targetName: string | null,
    before: string | null,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const subject = nameOf(action.target, ctx, targetName)
    const was = before !== null ? ` (was ${before} seconds)` : ''
    switch (call.kind) {
      case 'delayCooldown': {
        const shorter = before !== null && BigInt(call.seconds) < BigInt(before)
        if (call.seconds === '0' || shorter) {
          return {
            kind: IAssessmentFindingKind.Risk,
            severity: IAssessmentSeverity.High,
            labels: ['protectionReduced'],
            title: `Sets the cooldown of ${subject} to ${call.seconds} seconds${was}`,
            details: [
              call.seconds === '0'
                ? 'queued transactions execute at once: the delay that gave time to veto is gone'
                : 'less time to veto a queued transaction',
            ],
          }
        }
        return {
          kind: IAssessmentFindingKind.Change,
          title: `Sets the cooldown of ${subject} to ${call.seconds} seconds${was}`,
          details: ['queued transactions wait this long before they can execute'],
          limits: before === null ? ['the cooldown before the action is not read'] : [],
        }
      }
      case 'delayExpiration':
        return {
          kind: IAssessmentFindingKind.Change,
          title: `Sets the expiration of ${subject} to ${call.seconds} seconds${was}`,
          details: [
            call.seconds === '0'
              ? 'queued transactions never expire'
              : 'a queued transaction not executed within this time after its cooldown expires',
          ],
        }
      case 'delayNonce':
        return {
          kind: IAssessmentFindingKind.Change,
          title: `Skips the queued transactions of ${subject} up to nonce ${call.nonce}`,
          details: ['the skipped transactions will never execute: a veto'],
        }
      case 'delaySkip':
        return {
          kind: IAssessmentFindingKind.Change,
          title: `Drops the expired transactions of ${subject}`,
          details: ['only transactions past their expiration are affected'],
        }
    }
  },

  /**
   * The DAO's own forwarder is only reported: OSx permission checks look at the direct caller.
   * A staged processor reads the forwarded sender, so whoever controls its forwarder can act as
   * any of its bodies. Anything else is a contract nothing here understands.
   */
  _forwarder(
    action: IAssessmentFlatAction,
    forwarder: string,
    targetName: string | null,
    before: string | null,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const subject = nameOf(action.target, ctx, targetName)
    const change = before ? `from ${before} to ${forwarder}` : `to ${forwarder}`
    if (forwarder === ZERO) {
      return {
        kind: IAssessmentFindingKind.Change,
        title: `Removes the trusted forwarder of ${subject}`,
        details: [before ? `was ${before}` : 'the forwarder before the action is not read'],
      }
    }
    const isSpp =
      ctx.plugins.some(p => p.address === action.target && p.interfaceType === 'spp') ||
      targetName === 'StagedProposalProcessor'
    if (isSpp) {
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.Critical,
        title: `Sets the trusted forwarder of ${subject} ${change}`,
        details: [
          'the processor accepts the sender a forwarder names: whoever controls it can report results and advance stages as any body',
        ],
      }
    }
    if (ComponentsCheck._isDao(action.target, targetName, ctx)) {
      return {
        kind: IAssessmentFindingKind.Change,
        title: `Sets the trusted forwarder of the DAO ${change}`,
        details: ['permission checks on the DAO look at the direct caller, so the forwarder passes none of them'],
        limits: ['whether the deployed implementation honours the forwarded sender is not read from its code'],
      }
    }
    return {
      kind: IAssessmentFindingKind.NeedsReview,
      title: `Sets the trusted forwarder of ${subject} ${change}`,
      details: ['what the contract lets a forwarded sender do is not known here'],
    }
  },

  _callback(
    action: IAssessmentFlatAction,
    call: Extract<IComponentCall, { kind: 'callback' }>,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const known =
      KNOWN_CALLBACKS[call.interfaceId.toLowerCase()] ?? KNOWN_CALLBACKS[call.callbackSelector.toLowerCase()]
    const what =
      call.magicNumber === '0x00000000'
        ? 'answers with a rejection'
        : (known ?? `answers callback ${call.callbackSelector} for interface ${call.interfaceId}`)
    return {
      kind: IAssessmentFindingKind.Change,
      title: `Registers a callback on ${nameOf(action.target, ctx, null)}: ${what}`,
      details: [
        `interface ${call.interfaceId}, callback ${call.callbackSelector}, returns ${call.magicNumber}`,
        'touches neither control nor assets',
      ],
    }
  },

  _validator(action: IAssessmentFlatAction, validator: string, ctx: Readonly<IAssessmentContext>): IGraded {
    const subject = nameOf(action.target, ctx, null)
    if (validator === ZERO) {
      return {
        kind: IAssessmentFindingKind.Change,
        title: `Removes the signature validator of ${subject}`,
        details: ['the DAO answers ERC-1271 through VALIDATE_SIGNATURE grants only'],
      }
    }
    return {
      kind: IAssessmentFindingKind.Risk,
      severity: IAssessmentSeverity.Critical,
      title: `Sets the signature validator of ${subject} to ${validator}`,
      details: [
        "the validator decides which signatures count as the DAO's: it can make the DAO sign approvals, orders or any message another protocol honours",
      ],
      limits: ['on OSx 1.4 and later this call reverts; the sequence rule shows whether it does here'],
    }
  },

  _signatureGrant(op: IPermissionOp): IGraded {
    const anyone = op.who === ANY_ADDR
    if (op.op === 'revoke') {
      return {
        kind: IAssessmentFindingKind.Change,
        title: `Revokes VALIDATE_SIGNATURE from ${anyone ? 'everyone' : op.who}`,
        details: [`${anyone ? 'no generic validator' : op.who} can no longer present signatures as the DAO's`],
      }
    }
    if (anyone) {
      if (!op.condition) {
        return {
          kind: IAssessmentFindingKind.Risk,
          severity: IAssessmentSeverity.Critical,
          title: 'Lets anyone present any hash as signed by the DAO',
          details: ['the grant is to everyone and carries no condition: every hash asked about counts as signed'],
        }
      }
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.High,
        title: `Makes condition ${op.condition} a generic signature validator for the DAO`,
        details: ['anyone asking gets the answer the condition gives; what hashes it accepts is not read'],
        limits: ['condition contracts are not interpreted'],
      }
    }
    if (!op.condition) {
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.High,
        title: `Lets ${op.who} present any hash as signed by the DAO`,
        details: ["the grant is unconditional: every signature that contract asks about counts as the DAO's"],
      }
    }
    return {
      kind: IAssessmentFindingKind.Change,
      title: `Lets ${op.who} present hashes condition ${op.condition} accepts as signed by the DAO`,
      details: ['what the condition accepts is not read'],
      limits: ['condition contracts are not interpreted'],
    }
  },

  /**
   * Where a plugin sends execution. By call to the DAO is the ordinary setup. By delegatecall
   * the actions run as the plugin, with its balance and storage, through whatever code the
   * target holds: only the shared GlobalExecutor is expected, and a name alone does not prove it.
   */
  _targetConfig(
    action: IAssessmentFlatAction,
    call: Extract<IComponentCall, { kind: 'targetConfig' }>,
    installedName: string | null,
    before: string | null,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const subject = nameOf(action.target, ctx, null)
    const toDao = call.target === ctx.request.daoAddress
    const title = `Points ${subject} at ${toDao ? 'the DAO' : call.target} by ${call.operation}`
    const details = [before ? `was ${before}` : 'the target config before the action is not read']
    if (call.operation === 'delegatecall') {
      if (toDao)
        return {
          kind: IAssessmentFindingKind.Change,
          title,
          details: [...details, 'the plugin rejects a DAO target combined with delegatecall; execute reverts on it'],
        }
      if (installedName === 'GlobalExecutor')
        return {
          kind: IAssessmentFindingKind.NeedsReview,
          title: `${title} (named GlobalExecutor)`,
          details: [
            ...details,
            'actions run as the plugin through this contract; its name matches the shared executor, its deployment is not verified here',
          ],
          limits: ["the network's GlobalExecutor deployment is not known to the checks"],
        }
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.Critical,
        title,
        details: [
          ...details,
          `proposal actions run as the plugin with the code at ${call.target}${installedName ? ` (${installedName})` : ', which is not the shared executor'}`,
        ],
      }
    }
    if (toDao)
      return {
        kind: IAssessmentFindingKind.Change,
        title,
        details: [...details, 'the plugin executes through the DAO, the ordinary setup'],
      }
    return {
      kind: IAssessmentFindingKind.Risk,
      severity: IAssessmentSeverity.High,
      title,
      details: [
        ...details,
        `the plugin executes through ${call.target}${installedName ? ` (${installedName})` : ''} instead of the DAO`,
      ],
    }
  },

  _isDao(target: string, targetName: string | null, ctx: Readonly<IAssessmentContext>): boolean {
    return target === ctx.request.daoAddress || targetName === 'DAO'
  },

  _finding(path: string, graded: IGraded, after: unknown): IAssessmentFinding {
    return {
      id: `${COMPONENTS_CHECK_ID}:${path}`,
      checkId: COMPONENTS_CHECK_ID,
      kind: graded.kind,
      ...(graded.severity ? { severity: graded.severity } : {}),
      labels: graded.labels ?? [],
      notify: true,
      title: graded.title,
      details: graded.details,
      actionPaths: [path.split('#')[0]],
      ...(graded.limits?.length ? { evidenceLimit: graded.limits.join('; ') } : {}),
      after,
    }
  },
}

export default ComponentsCheck
