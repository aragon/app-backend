import ContractHelper from '@helpers/contractHelper'
import logger from '@logger'
import { type HexAddress, type NetworksEnum } from '@types'
import WorkspaceConfig from '@workspace/config'
import AccessControlDetector from '@workspace/helpers/accessControlDetector'
import KnownAccounts from '@workspace/helpers/knownAccounts'
import { WorkspaceModels } from '@workspace/models'
import { type IAccessControlReport, IAccessControlGuardRequirement } from '@workspace/types/accessControl'
import {
  IWorkspaceAccountType,
  type IWorkspaceGate,
  type IWorkspaceHolder,
  IWorkspaceStatus,
  IWorkspaceTargetStatus,
} from '@workspace/types/workspace'
import async from 'async'
import HolderDiscovery, { type IHolderQuery } from './holderDiscovery'

const llo = logger.logMeta.bind(null, { service: 'workspace:Scanner' })

/** The requirements worth recording — the ones that actually gate a function. */
const GATED = [
  IAccessControlGuardRequirement.role,
  IAccessControlGuardRequirement.owner,
  IAccessControlGuardRequirement.authority,
]

const WorkspaceScanner = {
  /**
   * The whole job, for one workspace:
   *
   *   1. classify each target and probe which role each function demands
   *   2. find who holds those roles, by replaying grant/revoke logs
   *   3. work out which of those holders is a DAO, Safe or plugin
   *   4. join 1 and 2 into rows saying who can call what
   */
  scan: async (workspaceId: string): Promise<void> => {
    const workspace = await WorkspaceModels.Workspace.findOne({ id: workspaceId })
    if (!workspace) {
      logger.warn('Workspace disappeared before its scan started', llo({ workspaceId }))
      return
    }

    const { network } = workspace
    await WorkspaceModels.Workspace.updateOne(
      { id: workspaceId },
      { $set: { status: IWorkspaceStatus.scanning, error: null } },
    )

    try {
      // A re-scan starts from nothing: a target that succeeded last time and
      // fails now would otherwise keep its old gates while _writeCapabilities
      // rebuilds the rows without them, leaving the two views disagreeing.
      await WorkspaceModels.WorkspaceTarget.updateMany(
        { workspaceId },
        {
          $set: {
            status: IWorkspaceTargetStatus.pending,
            schemes: [],
            owner: null,
            pendingOwner: null,
            authority: null,
            supportsAccessControlInterface: null,
            gates: [],
            error: null,
          },
        },
      )

      const targets = await WorkspaceModels.WorkspaceTarget.find({ workspaceId })

      const reports = new Map<HexAddress, IAccessControlReport>()
      await async.eachLimit(targets, WorkspaceConfig.SCAN_CONCURRENCY, async target => {
        const report = await WorkspaceScanner.scanTarget(workspaceId, target.address, network)
        if (report) reports.set(target.address, report)
      })

      const holders = await WorkspaceScanner._holders(network, reports)

      // Classified once here, then reused by both writes below.
      const accounts = await KnownAccounts.classify(
        holders.map(holder => holder.account),
        network,
      )

      const gates = await WorkspaceScanner._writeGates(workspaceId, reports, holders, accounts)
      await WorkspaceScanner._writeCapabilities(workspaceId, network, gates)

      await WorkspaceModels.Workspace.updateOne({ id: workspaceId }, { $set: { status: IWorkspaceStatus.ready } })
      logger.info('Workspace scan finished', llo({ workspaceId, targets: targets.length }))
    } catch (error: any) {
      await WorkspaceModels.Workspace.updateOne(
        { id: workspaceId },
        { $set: { status: IWorkspaceStatus.failed, error: error?.message ?? String(error) } },
      )
      throw error
    }
  },

  /** Runs a scan without blocking the request that triggered it. */
  scanInBackground: (workspaceId: string): void => {
    void WorkspaceScanner.scan(workspaceId).catch(error =>
      logger.error('Workspace scan failed', llo({ workspaceId, error })),
    )
  },

  /**
   * Step 1 for one target. A target failing never fails the workspace — its row
   * carries the reason and the rest of the scan continues.
   */
  scanTarget: async (
    workspaceId: string,
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<IAccessControlReport | null> => {
    const set = async (update: Record<string, any>) =>
      WorkspaceModels.WorkspaceTarget.updateOne({ workspaceId, address }, { $set: update })

    try {
      const bytecode = await ContractHelper.getBytecode(address, network)
      if (!bytecode) {
        await set({ status: IWorkspaceTargetStatus.notAContract })
        return null
      }

      const report = await AccessControlDetector.detect(address, network, {
        probeGuards: true,
        maxProbes: WorkspaceConfig.MAX_PROBES,
      })

      // No ABI, so nothing can be said either way. Explicitly NOT "no access control".
      if (!report) {
        await set({ status: IWorkspaceTargetStatus.undetermined })
        return null
      }

      await set({
        status: IWorkspaceTargetStatus.done,
        schemes: report.schemes,
        owner: report.owner,
        pendingOwner: report.pendingOwner,
        authority: report.authority,
        supportsAccessControlInterface: report.supportsAccessControlInterface,
        error: null,
      })

      return report
    } catch (error: any) {
      logger.error('Target scan failed', llo({ workspaceId, address, network, error }))
      await set({ status: IWorkspaceTargetStatus.failed, error: error?.message ?? String(error) })
      return null
    }
  },

  /**
   * Step 2 — who holds the power that actually gates something.
   *
   * Three sources, cheapest first, and the crawl is the last resort:
   *
   *   owner()            a live read the detector already made
   *   getRoleMember()    already listed, when the contract is Enumerable
   *   event replay       only for a role that gates a function on a contract
   *                      whose members cannot be read
   *
   * A function the probe found open (`none`) or could not classify (`unknown`)
   * contributes nothing here — there is no gate to attribute to anybody.
   */
  _holders: async (
    network: NetworksEnum,
    reports: Map<HexAddress, IAccessControlReport>,
  ): Promise<IWorkspaceHolder[]> => {
    const holders: IWorkspaceHolder[] = []
    const seen = new Set<string>()
    const add = (holder: IWorkspaceHolder) => {
      const key = `${holder.target}:${holder.role}:${holder.account}`
      if (seen.has(key)) return
      seen.add(key)
      holders.push(holder)
    }

    const queries: IHolderQuery[] = []

    for (const [target, report] of reports) {
      if (report.owner) add({ target, role: null, account: report.owner })

      const members = new Map(report.roles.map(role => [role.id, role.members]))

      // Roles the probe proved gate a function, and whose members we cannot read.
      const unreadable = [
        ...new Set(
          (report.guards ?? [])
            .filter(guard => guard.requirement === IAccessControlGuardRequirement.role && guard.role)
            .map(guard => guard.role!)
            .filter(role => !members.get(role)),
        ),
      ]

      for (const role of report.roles) {
        for (const member of role.members ?? []) add({ target, role: role.id, account: member })
      }

      if (unreadable.length) queries.push({ target, roles: unreadable })
    }

    if (!queries.length) {
      logger.verbose('No role needs a log replay', llo({ network, targets: reports.size }))
      return holders
    }

    try {
      for (const holder of await HolderDiscovery.forTargets(queries, network)) add(holder)
    } catch (error: any) {
      // A network HyperSync does not serve still keeps everything read above.
      logger.warn('Holder replay unavailable, using direct reads only', llo({ network, error }))
    }

    return holders
  },

  /**
   * Step 3 — turn "these functions demand X" plus "these accounts hold X" into
   * one gate per distinct requirement, and store it on the target.
   *
   * Guards the probe reported as open or could not classify are dropped here:
   * they gate nothing, so there is nobody to attribute them to. A role that
   * gates no function is dropped for the same reason, even if it has holders.
   */
  _writeGates: async (
    workspaceId: string,
    reports: Map<HexAddress, IAccessControlReport>,
    holders: IWorkspaceHolder[],
    accounts: Map<HexAddress, { type: IWorkspaceAccountType; ref: string | null }>,
  ): Promise<Map<HexAddress, IWorkspaceGate[]>> => {
    const byTarget = new Map<HexAddress, IWorkspaceGate[]>()

    for (const [target, report] of reports) {
      const roleInfo = new Map(report.roles.map(role => [role.id, role]))
      const forTarget = holders.filter(holder => holder.target === target)

      // Keyed by requirement + role so every selector demanding the same thing
      // collapses into one gate.
      const gates = new Map<string, IWorkspaceGate>()

      for (const guard of report.guards ?? []) {
        if (!GATED.includes(guard.requirement)) continue

        // `inferred` is part of the key so a probed gate and an inferred one for
        // the same requirement stay apart — they carry different confidence.
        const key = `${guard.requirement}:${guard.role ?? ''}:${guard.inferred ? 'inferred' : 'probed'}`
        const existing = gates.get(key)

        if (existing) {
          existing.selectors.push({ selector: guard.selector, signature: guard.signature })
          continue
        }

        const role = guard.role ? roleInfo.get(guard.role) : undefined
        gates.set(key, {
          requirement: guard.requirement,
          role: guard.role,
          roleName: role?.name ?? null,
          inferred: guard.inferred === true,
          holders: WorkspaceScanner._holdersFor(guard, forTarget, report).map(address => ({
            address,
            type: accounts.get(address)?.type ?? IWorkspaceAccountType.contract,
            ref: accounts.get(address)?.ref ?? null,
          })),
          selectors: [{ selector: guard.selector, signature: guard.signature }],
        })
      }

      const list = [...gates.values()]
      byTarget.set(target, list)
      await WorkspaceModels.WorkspaceTarget.updateOne({ workspaceId, address: target }, { $set: { gates: list } })
    }

    return byTarget
  },

  /** Who satisfies one gate: role holders, the owner, or the authority. */
  _holdersFor: (
    guard: { requirement: IAccessControlGuardRequirement; role: string | null },
    forTarget: IWorkspaceHolder[],
    report: IAccessControlReport,
  ): HexAddress[] => {
    if (guard.requirement === IAccessControlGuardRequirement.role && guard.role) {
      return forTarget.filter(holder => holder.role === guard.role).map(holder => holder.account)
    }
    if (guard.requirement === IAccessControlGuardRequirement.owner) {
      return report.owner ? [report.owner] : []
    }
    return report.authority ? [report.authority] : []
  },

  /**
   * Step 4 — flatten the gates into one row per (account, target, selector), with
   * each account resolved to a DAO, Safe, plugin or plain address.
   *
   * This is the same information as `gates`, turned inside out: gates answer
   * "what protects this contract", capabilities answer "what can this account do".
   */
  _writeCapabilities: async (
    workspaceId: string,
    network: NetworksEnum,
    gatesByTarget: Map<HexAddress, IWorkspaceGate[]>,
  ): Promise<void> => {
    const rows: Array<Record<string, any>> = []

    for (const [target, gates] of gatesByTarget) {
      for (const gate of gates) {
        for (const holder of gate.holders) {
          for (const { selector, signature } of gate.selectors) {
            rows.push({
              id: `${workspaceId}-${target}-${holder.address}-${selector}`,
              workspaceId,
              network,
              target,
              account: holder.address,
              accountType: holder.type,
              accountRef: holder.ref,
              selector,
              functionName: signature,
              viaRole: gate.role,
              roleName: gate.roleName,
            })
          }
        }
      }
    }

    // Re-runnable: a second scan replaces the rows rather than doubling them.
    await WorkspaceModels.WorkspaceCapability.deleteMany({ workspaceId })
    if (rows.length) await WorkspaceModels.WorkspaceCapability.insertMany(rows)

    logger.info('Capabilities written', llo({ workspaceId, capabilities: rows.length }))
  },
}

export default WorkspaceScanner
