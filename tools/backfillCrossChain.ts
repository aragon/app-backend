import { Models } from '@dbModels'
import { PluginHandler } from '@handlers/pluginHandler'
import { ProposalHandler } from '@handlers/proposalHandler'
import ConfigIndexerHelper from '@helpers/configIndexer'
import PluginDetector from '@helpers/pluginDetector'
import { PluginSlug } from '@helpers/pluginSlug'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import ProviderModule from '@modules/provider'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { LogCrossChain } from '@services/aragon-plugins/logCrossChain'
import { LogSelectorPermission } from '@services/aragon-plugins/logSelectorPermission'
import { IPermission } from '@src/types/permission'
import {
  EnumConnection,
  type HexAddress,
  IEventLogPermission,
  IPluginInterfaceType,
  IPluginStatus,
  type IService,
  KnownActionSignature,
  type LogServicePattern,
  NetworksEnum,
} from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'tools:backfillCrossChain' })
const DEFAULT_SINCE = '2026-07-30T00:00:00Z'

const FORWARD_MESSAGE_SELECTOR = ethers.id(KnownActionSignature.ForwardMessage).slice(0, 10)

const EXECUTE_PERMISSION_ID = ethers.id(IPermission.EXECUTE_PERMISSION)

const NEEDS_DECODE_MATCH = {
  selector: { $ne: null },
  $or: [{ decoded: null }, { decoded: { $exists: false } }, { 'decoded.functionName': null }],
}

/**
 * Drops the crawl cursor so the next `Log*.start` recomputes its own natural start block.
 * Rewinding to a guessed block would miss logs whose contract predates the plugin;
 * deleting hands that decision back to the crawler that owns it.
 */
const resetCursor = async (network: NetworksEnum, service: LogServicePattern): Promise<boolean> => {
  const existing = await Models.ConfigIndexer.findExistingLog({ network, service })
  if (!existing) return false

  await Models.ConfigIndexer.deleteOne({ id: existing.id })
  return true
}

/**
 * Promotes plugins that were installed before the detector knew the controller's function
 * set — they landed as `unknown` and never reached the cross-chain crawler.
 *
 * Only `unknown` rows can be a missed controller: anything detected as another interface
 * matched a different function set and re-probing it would just burn an RPC call per
 * plugin. Rows already typed as a controller are re-visited so a slug or condition link
 * that never got written is repaired in the same run.
 *
 * Deliberately unbounded by SINCE: a controller mistyped at install stays mistyped
 * forever, so an install date is no signal of whether it needs repair.
 */
const detectControllers = async (scope: Record<string, unknown>, execute: boolean) => {
  const candidates = await Models.Plugin.find({
    ...scope,
    status: IPluginStatus.installed,
    interfaceType: { $in: [IPluginInterfaceType.unknown, IPluginInterfaceType.crossChainController, null] },
  })

  let promoted = 0
  let repaired = 0

  for (const candidate of candidates) {
    if (candidate.interfaceType === IPluginInterfaceType.crossChainController) {
      if (execute) {
        await PluginSlug.generateSlug(candidate, candidate.processKey)
        await PluginHandler.recoverConditionAddress(candidate)
      }
      repaired++
      continue
    }

    const pluginInfo = await PluginDetector.detectPluginType(candidate.address, candidate.network)
    if (pluginInfo?.type !== IPluginInterfaceType.crossChainController) continue

    promoted++
    logger.info(
      execute ? 'Promoting plugin to crossChainController' : 'Would promote plugin to crossChainController',
      llo({ address: candidate.address, network: candidate.network, was: candidate.interfaceType }),
    )
    if (!execute) continue

    const updated = await DbOperations.updateDocument(
      candidate,
      {
        interfaceType: IPluginInterfaceType.crossChainController,
        implementationAddress: pluginInfo.implementationAddress || candidate.implementationAddress,
        isProcess: false,
        isBody: false,
        isSubPlugin: false,
      },
      { logId: candidate.id },
      'Promote cross-chain controller',
      llo,
    )
    if (!updated) continue

    await PluginSlug.generateSlug(updated, updated.processKey)
    await PluginHandler.recoverConditionAddress(updated)
  }

  return { scanned: candidates.length, promoted, repaired }
}

const resyncSettings = async (controllers: Plugin[], execute: boolean) => {
  let resynced = 0

  for (const plugin of controllers) {
    logger.info(
      execute ? 'Resyncing cross-chain settings' : 'Would resync cross-chain settings',
      llo({ address: plugin.address, network: plugin.network }),
    )
    resynced++
    if (!execute) continue

    await resetCursor(
      plugin.network,
      ConfigIndexerHelper.builders.plugin(IPluginInterfaceType.crossChainController, plugin.network, plugin.address),
    )
    await LogCrossChain.start(plugin)
  }

  return { resynced }
}

/**
 * Re-crawls the selector condition of each plugin it is given — the SPPs, since that is
 * where the condition is linked. The cross-chain condition emits SelectorAllowed under its
 * own topic hash, which the indexer only started matching with this release, so every
 * earlier event was skipped while the cursor moved past it.
 */
const resyncSelectorPermissions = async (plugins: Plugin[], execute: boolean) => {
  let resynced = 0
  let missingCondition = 0

  for (const plugin of plugins) {
    if (!plugin.conditionAddress) {
      logger.warn(
        'Plugin has no condition address, skipping selector resync',
        llo({ address: plugin.address, network: plugin.network }),
      )
      missingCondition++
      continue
    }

    logger.info(
      execute ? 'Resyncing selector permissions' : 'Would resync selector permissions',
      llo({ address: plugin.address, network: plugin.network, conditionAddress: plugin.conditionAddress }),
    )
    resynced++
    if (!execute) continue

    await resetCursor(plugin.network, ConfigIndexerHelper.builders.permission(plugin.network, plugin.address))
    await LogSelectorPermission.start(plugin)
  }

  return { resynced, missingCondition }
}

/**
 * Re-resolves `decoded` on selector permissions that were indexed without it. A row's
 * target lives on its `chainId`, so the signature has to be read on that chain and not on
 * the one that emitted the log — rows written before cross-chain support used the emitting
 * chain and came back empty whenever the target was remote.
 */
const refreshDecodedSelectors = async (scope: Record<string, unknown>, execute: boolean) => {
  const rows = await Models.SelectorPermission.find({ ...NEEDS_DECODE_MATCH, ...scope })

  let decoded = 0
  let unresolved = 0
  let unindexedChain = 0

  for (const row of rows) {
    const destinationNetwork = row.chainId == null ? row.network : ProviderModule.getNetworkByChainId(row.chainId)

    if (!destinationNetwork) {
      logger.warn('Destination chain not indexed, skipping', llo({ id: row.id, chainId: row.chainId }))
      unindexedChain++
      continue
    }

    let selectorInfo: Awaited<ReturnType<typeof ContractInfo.parseSignature>> | null = null
    try {
      selectorInfo = await ContractInfo.parseSignature(row.selector, row.target, destinationNetwork)
    } catch (error) {
      logger.warn('parseSignature failed', llo({ id: row.id, target: row.target, error }))
    }

    if (!selectorInfo?.functionName) {
      logger.verbose('No verified source for target, leaving as-is', llo({ id: row.id, target: row.target }))
      unresolved++
      continue
    }

    if (execute) {
      await Models.SelectorPermission.updateOne(
        { id: row.id },
        {
          $set: {
            decoded: {
              functionName: selectorInfo.functionName,
              contractName: selectorInfo.contractName,
              proxyName: selectorInfo.proxyName ?? null,
              implementationAddress: selectorInfo.implementationAddress ?? null,
              inputs: selectorInfo.inputs ?? null,
              notice: selectorInfo.notice ?? null,
            },
          },
        },
      )
    }

    decoded++
    logger.info(
      execute ? 'Decoded selector permission' : 'Would decode selector permission',
      llo({ id: row.id, selector: row.selector, chainId: row.chainId, functionName: selectorInfo.functionName }),
    )
  }

  return { candidates: rows.length, decoded, unresolved, unindexedChain }
}

/**
 * Re-decodes proposals carrying a `forwardMessage` call so their actions gain the
 * CrossChainExecute type and the destination-chain children underneath it. The match is
 * deliberately unanchored: a forwardMessage nested inside an `execute` shows up in the
 * middle of the outer calldata, and re-decoding an already-correct proposal is a no-op.
 */
const redecodeProposalActions = async (since: number, scope: Record<string, unknown>, execute: boolean) => {
  const proposals = await Models.Proposal.find({
    ...scope,
    blockTimestamp: { $gte: since },
    'rawActions.data': { $regex: FORWARD_MESSAGE_SELECTOR.slice(2), $options: 'i' },
  })

  let decoded = 0
  for (const proposal of proposals) {
    logger.info(
      execute ? 'Re-decoding proposal actions' : 'Would re-decode proposal actions',
      llo({ id: proposal.id, pluginAddress: proposal.pluginAddress, network: proposal.network }),
    )
    if (execute) await ProposalHandler.parseActions(proposal)
    decoded++
  }

  return { candidates: proposals.length, decoded }
}

/**
 * Reads the newest EXECUTE grant for a plugin, the same lookup
 * `PluginHandler.recoverConditionAddress` performs, so the report says exactly what that
 * repair would find. `recoverable` means the DaoPermission row holds a condition the
 * plugin is missing — the grant landed before the plugin row existed.
 */
const readExecuteGrant = async (plugin: Plugin) => {
  const grant = await Models.DaoPermission.findOne({
    network: plugin.network,
    daoAddress: plugin.daoAddress,
    whoAddress: plugin.address,
    permissionId: EXECUTE_PERMISSION_ID,
  }).sort({ blockNumber: -1, transactionIndex: -1, logIndex: -1 })

  return {
    grantFound: !!grant,
    grantEvent: grant?.event ?? null,
    grantCondition: grant?.conditionAddress ?? null,
    grantBlock: grant?.blockNumber ?? null,
    recoverable: grant?.event === IEventLogPermission.Granted && !!grant.conditionAddress && !plugin.conditionAddress,
  }
}

/**
 * The SPPs installed on the DAOs that host the controllers, deduplicated. Several
 * controllers can share one DAO, so collecting per controller would return the same SPP
 * more than once.
 *
 * The selector condition guards the process that forwards the message, not the controller
 * — verified on sandbox, where every controller's EXECUTE grant carries no condition while
 * the SPPs' do. So the SPPs are what the selector work has to run against.
 */
const collectSpps = async (controllers: Plugin[]): Promise<Plugin[]> => {
  const daos = new Map<string, { network: NetworksEnum; daoAddress: HexAddress }>()
  for (const controller of controllers) {
    daos.set(`${controller.network}:${controller.daoAddress}`, {
      network: controller.network,
      daoAddress: controller.daoAddress,
    })
  }

  const spps: Plugin[] = []
  for (const { network, daoAddress } of daos.values()) {
    const found = await Models.Plugin.find({
      network,
      daoAddress,
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.spp,
    })

    logger.info('SPPs on the controller DAO', llo({ network, daoAddress, sppCount: found.length }))
    spps.push(...found)
  }

  return spps
}

/**
 * Logs, for every controller and SPP, whether the plugin row carries a condition address
 * and what the DaoPermission grant behind it holds. Read-only — the repair is a separate
 * step so a plain report can be run without writing anything.
 */
const reportConditions = async (controllers: Plugin[], spps: Plugin[]) => {
  let controllersRecoverable = 0
  let sppsWithCondition = 0
  let sppsWithoutCondition = 0
  let sppsRecoverable = 0

  for (const controller of controllers) {
    const grant = await readExecuteGrant(controller)
    if (grant.recoverable) controllersRecoverable++

    logger.info(
      controller.conditionAddress ? 'Controller has a condition address' : 'Controller has NO condition address',
      llo({
        network: controller.network,
        daoAddress: controller.daoAddress,
        controller: controller.address,
        conditionAddress: controller.conditionAddress || null,
        ...grant,
      }),
    )
  }

  for (const spp of spps) {
    const grant = await readExecuteGrant(spp)
    if (spp.conditionAddress) {
      sppsWithCondition++
    } else {
      sppsWithoutCondition++
    }
    if (grant.recoverable) sppsRecoverable++

    logger.info(
      spp.conditionAddress ? 'SPP has a condition address' : 'SPP has NO condition address',
      llo({
        network: spp.network,
        daoAddress: spp.daoAddress,
        spp: spp.address,
        conditionAddress: spp.conditionAddress || null,
        ...grant,
      }),
    )
  }

  return { controllersRecoverable, sppsWithCondition, sppsWithoutCondition, sppsRecoverable }
}

/**
 * Re-attaches condition addresses that indexing order lost. `permissionHandler` sets a
 * plugin's condition only at the moment the EXECUTE grant is indexed, and
 * `updateConditionAddress` gives up when no plugin row exists yet — nothing retries later,
 * so the link stays null forever while DaoPermission keeps the answer.
 *
 * Driven from the grants rather than from the plugins: the grant set is small and indexed
 * on permissionId, whereas walking every plugin would cost one lookup each.
 *
 * A plugin whose stored condition merely *disagrees* with the newest grant is reported but
 * never overwritten — that is a different situation from a missing link, and deciding
 * which side wins is not this tool's call.
 */
const recoverConditionAddresses = async (scope: Record<string, unknown>, execute: boolean) => {
  const events = await Models.DaoPermission.find({
    ...scope,
    permissionId: EXECUTE_PERMISSION_ID,
  }).sort({ blockNumber: 1, transactionIndex: 1, logIndex: 1 })

  const newest = new Map<string, (typeof events)[number]>()
  for (const event of events) {
    newest.set(`${event.network}:${event.daoAddress}:${event.whoAddress}`, event)
  }

  let attached = 0
  let alreadyLinked = 0
  let mismatched = 0
  let pluginMissing = 0

  for (const grant of newest.values()) {
    if (grant.event !== IEventLogPermission.Granted || !grant.conditionAddress) continue
    const plugin = await Models.Plugin.findOne({
      address: grant.whoAddress,
      daoAddress: grant.daoAddress,
      network: grant.network,
    })

    if (!plugin) {
      pluginMissing++
      continue
    }

    if (plugin.conditionAddress === grant.conditionAddress) {
      alreadyLinked++
      continue
    }

    if (plugin.conditionAddress) {
      mismatched++
      logger.warn(
        'Plugin condition disagrees with its newest grant, left as-is',
        llo({
          network: plugin.network,
          daoAddress: plugin.daoAddress,
          plugin: plugin.address,
          interfaceType: plugin.interfaceType,
          stored: plugin.conditionAddress,
          grantCondition: grant.conditionAddress,
          grantBlock: grant.blockNumber,
        }),
      )
      continue
    }

    attached++
    logger.info(
      execute ? 'Attaching condition address from grant' : 'Would attach condition address from grant',
      llo({
        network: plugin.network,
        daoAddress: plugin.daoAddress,
        plugin: plugin.address,
        interfaceType: plugin.interfaceType,
        conditionAddress: grant.conditionAddress,
        grantBlock: grant.blockNumber,
      }),
    )
    if (!execute) continue

    // Also publishes to the logSelectorPermission queue, so a running aragon-plugins will
    // crawl the condition too. Harmless overlap — the crawl is cursor-based and dedupes.
    await PluginHandler.updateConditionAddress(
      plugin.address,
      plugin.daoAddress,
      plugin.network,
      grant.conditionAddress!,
    )
  }

  return { grants: newest.size, attached, alreadyLinked, mismatched, pluginMissing }
}

export const BackfillCrossChain: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    await ProviderModule.connectToAllNetworks()

    const execute = process.env.EXECUTE === 'true'
    const targetNetwork = process.env.TARGET_NETWORK as NetworksEnum | undefined
    const since = Math.floor(new Date(process.env.SINCE || DEFAULT_SINCE).getTime() / 1000)

    if (Number.isNaN(since)) {
      throw new Error(`Invalid SINCE value: ${process.env.SINCE}`)
    }

    const scope = targetNetwork ? { network: targetNetwork } : {}
    logger.info('Backfill cross-chain - start', llo({ execute, targetNetwork, since }))

    const detection = await detectControllers(scope, execute)

    // Read after detection so freshly promoted plugins are included in the same run.
    const controllers = await Models.Plugin.find({
      ...scope,
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.crossChainController,
    })

    // Before the SPPs are read, so the selector crawl below sees the links it restores.
    const recovery = await recoverConditionAddresses(scope, execute)

    const spps = await collectSpps(controllers)
    const conditions = await reportConditions(controllers, spps)
    logger.info(
      'Backfill cross-chain - condition report',
      llo({ controllers: controllers.length, spps: spps.length, ...conditions }),
    )

    const settings = await resyncSettings(controllers, execute)
    const selectors = await resyncSelectorPermissions(spps, execute)
    const decodedSelectors = await refreshDecodedSelectors(scope, execute)
    const proposals = await redecodeProposalActions(since, scope, execute)

    const summary = { detection, conditions, recovery, settings, selectors, decodedSelectors, proposals }
    if (!execute) {
      logger.warn('DRY RUN — no writes. Re-run with EXECUTE=true to apply.', llo(summary))
    } else {
      logger.info('Backfill cross-chain - done', llo(summary))
    }
  },

  stop: async () => {},
}

export default BackfillCrossChain
