import { PluginRepo } from '@artifacts/pluginRepo'
import { Models } from '@dbModels'
import logger from '@logger'
import KnownAbi from '@modules/proposalChecks/abi'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  type IAssessmentFlatAction,
  IEventLogPluginType,
  type IPluginSetupFacts,
  type IPluginSetupPermission,
  type NetworksEnum,
} from '@types'
import { Contract } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'proposalChecks:pluginSetups' })

const PREPARED_EVENT = {
  install: IEventLogPluginType.InstallationPrepared,
  update: IEventLogPluginType.UpdatePrepared,
  uninstall: IEventLogPluginType.UninstallationPrepared,
} as const

const KIND_OF_CALL: Record<string, IPluginSetupFacts['kind']> = {
  applyInstallation: 'install',
  applyUpdate: 'update',
  applyUninstallation: 'uninstall',
}

export interface IPluginSetupCall {
  kind: IPluginSetupFacts['kind']
  dao: string
  plugin: string
  repo: string
  release: number
  build: number
  permissions: IPluginSetupPermission[]
}

/**
 * Reads a plugin setup action against the index. Preparing a setup is permissionless and is
 * indexed as a Prepared event with who did it and which permissions it will apply; the apply
 * action in the proposal is what changes the DAO. The repo registry says whether the setup code
 * is a published build; the setups applied to the plugin by the block say which version it
 * runs; and the repo's own version table says whether an update swaps the setup contract or
 * only metadata.
 */
const PluginSetupFacts = {
  /** The apply parameters of a setup action, or null when the action is not one. */
  callOf(action: IAssessmentFlatAction): IPluginSetupCall | null {
    if (action.operation === 'delegatecall') return null
    const parsed = KnownAbi.parse(action.data)
    const kind = parsed ? KIND_OF_CALL[parsed.name] : undefined
    if (!parsed || !kind) return null
    const params = parsed.args._params
    return {
      kind,
      dao: parsed.args._dao,
      plugin: params.plugin,
      repo: params.pluginSetupRef.pluginSetupRepo,
      release: Number(params.pluginSetupRef.versionTag.release),
      build: Number(params.pluginSetupRef.versionTag.build),
      permissions: [...params.permissions].map(PluginSetupFacts._permission),
    }
  },

  async load(
    actions: readonly IAssessmentFlatAction[],
    network: NetworksEnum,
    block: number,
  ): Promise<Record<string, IPluginSetupFacts>> {
    const facts: Record<string, IPluginSetupFacts> = {}
    for (const action of actions) {
      const call = PluginSetupFacts.callOf(action)
      if (!call) continue
      try {
        facts[action.path] = await PluginSetupFacts._read(call, network, block)
      } catch (error) {
        logger.warn(
          'proposal checks: plugin setup facts could not be read',
          llo({ path: action.path, call, network, error }),
        )
      }
    }
    return facts
  },

  async _read(call: IPluginSetupCall, network: NetworksEnum, block: number): Promise<IPluginSetupFacts> {
    // The preparation this apply refers to: same DAO, plugin, repo and version, the latest such one at the block.
    const preparedLog = await Models.LogPluginSetupProcessor.findOne(
      {
        network,
        daoAddress: call.dao,
        pluginAddress: call.plugin,
        pluginSetupRepo: call.repo,
        release: String(call.release),
        build: String(call.build),
        event: PREPARED_EVENT[call.kind],
        blockNumber: { $lte: block },
      },
      null,
      { sort: { blockNumber: -1, logIndex: -1 } },
    )
    const repo = await Models.PluginRepo.findSubdomain(call.repo as HexAddress, network)
    const current = call.kind === 'install' ? null : await PluginSetupFacts._currentAt(call.plugin, network, block)

    return {
      ...call,
      prepared: preparedLog
        ? {
            sender: preparedLog.sender,
            release: Number(preparedLog.release),
            build: Number(preparedLog.build),
            permissionsMatch: PluginSetupFacts._samePermissions(
              call.permissions,
              (preparedLog.permissions ?? []).map(PluginSetupFacts._permission),
            ),
          }
        : null,
      repoSubdomain: repo?.subdomain ?? null,
      current,
      metadataOnly:
        call.kind === 'update' && current && current.repo === call.repo
          ? await PluginSetupFacts._sameSetupContract(call.repo, current, call, network, block)
          : null,
    }
  },

  _permission(p: {
    operation: number | bigint
    where: string
    who: string
    condition: string
    permissionId: string
  }): IPluginSetupPermission {
    const operation = Number(p.operation)
    return {
      op: operation === 1 ? 'revoke' : 'grant',
      where: p.where,
      who: p.who,
      permissionId: p.permissionId,
      condition: operation === 2 ? p.condition : null,
    }
  },

  /** Order does not matter to the processor; every prepared permission, condition included, must be applied and nothing else. */
  _samePermissions(applied: IPluginSetupPermission[], prepared: IPluginSetupPermission[]): boolean {
    const key = (p: IPluginSetupPermission) =>
      `${p.op}|${p.where}|${p.who}|${p.permissionId.toLowerCase()}|${(p.condition ?? '').toLowerCase()}`
    const a = applied.map(key).sort()
    const b = prepared.map(key).sort()
    return a.length === b.length && a.every((k, i) => k === b[i])
  },

  /**
   * The version the plugin ran at the block: the preparation behind the latest setup applied to
   * it by then. The indexed plugin record only knows today's version, so it is the fallback,
   * marked as such.
   */
  async _currentAt(plugin: string, network: NetworksEnum, block: number): Promise<IPluginSetupFacts['current']> {
    const record = await Models.Plugin.findByAddress(plugin as HexAddress, network)
    if (!record) return null
    const applied = await Models.LogPluginSetupProcessor.findOne(
      {
        network,
        pluginAddress: plugin,
        event: { $in: [IEventLogPluginType.InstallationApplied, IEventLogPluginType.UpdateApplied] },
        blockNumber: { $lte: block },
      },
      null,
      { sort: { blockNumber: -1, logIndex: -1 } },
    )
    const prepared = applied?.preparedSetupId
      ? await Models.LogPluginSetupProcessor.findOne({
          network,
          pluginAddress: plugin,
          preparedSetupId: applied.preparedSetupId,
          event: { $in: [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.UpdatePrepared] },
        })
      : null
    if (prepared?.release && prepared.build) {
      return {
        interfaceType: record.interfaceType,
        release: Number(prepared.release),
        build: Number(prepared.build),
        repo: prepared.pluginSetupRepo,
        asOf: 'block',
      }
    }
    return {
      interfaceType: record.interfaceType,
      release: Number(record.release),
      build: Number(record.build),
      repo: record.pluginSetupRepoAddress,
      asOf: 'now',
    }
  },

  /** Two builds that point at the same setup contract differ only in metadata; null when the repo could not be read. */
  async _sameSetupContract(
    repo: string,
    from: { release: number; build: number },
    to: { release: number; build: number },
    network: NetworksEnum,
    block: number,
  ): Promise<boolean | null> {
    try {
      const contract = new Contract(repo, PluginRepo.abi, ProviderModule.getAnyRpcProvider(network))
      const version = (tag: { release: number; build: number }) =>
        BottleneckModule.getNodeLimiter(network).schedule(() =>
          contract.getFunction('getVersion((uint8,uint16))')([tag.release, tag.build], { blockTag: block }),
        )
      const [current, next] = await Promise.all([version(from), version(to)])
      return String(current.pluginSetup) === String(next.pluginSetup)
    } catch (error) {
      logger.warn('proposal checks: plugin repo version could not be read', llo({ repo, network, error }))
      return null
    }
  },
}

export default PluginSetupFacts
