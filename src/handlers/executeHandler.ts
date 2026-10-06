import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type SelectorPermission from '@models/schema/selectorPermission'
import type { ActionDecoded } from '@models/schema/selectorPermission'
import DbTx from '@modules/dbTx'
import ProviderModule from '@modules/provider'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { type ILogInfo, IPluginStatus, type ISelectorPermissionIdParams, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { type ClientSession } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'handlers:ExecuteHandler' })

// What the sub schema fills in on its own, spelled out so a partially decoded signature still
// types as an `ActionDecoded`.
const EMPTY_DECODED: ActionDecoded = {
  functionName: null,
  contractName: null,
  proxyName: null,
  implementationAddress: null,
  inputs: null,
  notice: null,
  stateMutability: null,
}

export const ExecuteHandler = {
  /**
   * Destination chain the selector applies to. Read by name so the same handler serves
   * both event shapes: the cross-chain condition emits it, the same-chain condition
   * does not and falls back to the emitting chain's id.
   */
  _resolveChainId(parsedEvent: LogDescription, network: NetworksEnum): number {
    const chainId = parsedEvent.args?.chainId
    return chainId === undefined || chainId === null ? ProviderModule.getChainId(network) : Number(chainId)
  },

  _chainIdFilter(parsedEvent: LogDescription, chainId: number) {
    return parsedEvent.args?.chainId === undefined || parsedEvent.args?.chainId === null
      ? { $or: [{ chainId }, { chainId: null }] }
      : { chainId }
  },

  /**
   * The existence check and the write are far apart — the block timestamp and the signature both
   * come from RPC in between — so two workers on the same log can both decide to write. The unique
   * index on the entity id settles it, and `executeTxFn` hands the loser the row the winner wrote
   * instead of failing the message.
   */
  async _createSelectorPermission(payload: Partial<SelectorPermission>) {
    return await DbTx.executeTxFn(async ({ session }: { session: ClientSession }) => {
      const logDb = await Models.SelectorPermission.create(payload, { session })
      await DbTx.safeCommit(session)
      return logDb
    })
  },

  /**
   * One condition can back EXECUTE grants in several DAOs, one Plugin row per DAO.
   */
  _conditionPlugins(info: ILogInfo) {
    return Models.Plugin.find({
      conditionAddress: info.address,
      network: info.network,
      status: IPluginStatus.installed,
    })
  },

  /** The id of this log for each plugin on the condition that has no record of it yet. */
  async _pendingRecords(info: ILogInfo, plugins: Plugin[]) {
    const pending: ISelectorPermissionIdParams[] = []
    for (const plugin of plugins) {
      const params = {
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        conditionAddress: info.address,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
      }
      if (!(await Models.SelectorPermission.findExistingLog(params))) pending.push(params)
    }
    return pending
  },

  /**
   * A disallow replayed from an old block (e.g. another DAO's crawl) must not clear an allow
   * that came after it, so only rows from strictly earlier events match.
   */
  _before(info: ILogInfo) {
    return {
      $or: [
        { blockNumber: { $lt: info.blockNumber } },
        { blockNumber: info.blockNumber, transactionIndex: { $lt: info.transactionIndex } },
        {
          blockNumber: info.blockNumber,
          transactionIndex: info.transactionIndex,
          logIndex: { $lt: info.logIndex },
        },
      ],
    }
  },

  /** Rows whose disallow sits after this log on chain. */
  _disallowedAfter(info: ILogInfo) {
    return {
      $or: [
        { 'disallowed.blockNumber': { $gt: info.blockNumber } },
        { 'disallowed.blockNumber': info.blockNumber, 'disallowed.logIndex': { $gt: info.logIndex } },
      ],
    }
  },

  /** Writes the allow for each plugin on the condition that has no record of this log yet. */
  async _allow(
    parsedEvent: LogDescription,
    info: ILogInfo,
    selector: string | null,
    allowedLog: string,
    decode: (chainId: number) => Promise<ActionDecoded>,
  ) {
    const { where } = parsedEvent.args
    const chainId = ExecuteHandler._resolveChainId(parsedEvent, info.network)

    const plugins = await ExecuteHandler._conditionPlugins(info)
    if (plugins.length === 0) {
      logger.warn('Plugin not found for condition address', llo({ ...info }))
      return []
    }

    const pending = await ExecuteHandler._pendingRecords(info, plugins)
    if (pending.length === 0) return []

    const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)
    const decoded = await decode(chainId)

    const selectorRecords: SelectorPermission[] = []
    for (const selectorParams of pending) {
      const laterDisallow = await Models.SelectorPermission.findOne({
        selector,
        target: where,
        $and: [ExecuteHandler._chainIdFilter(parsedEvent, chainId), ExecuteHandler._disallowedAfter(info)],
        conditionAddress: info.address,
        network: info.network,
        daoAddress: selectorParams.daoAddress,
        pluginAddress: selectorParams.pluginAddress,
        isAllowed: false,
      }).sort({ 'disallowed.blockNumber': 1, 'disallowed.logIndex': 1 })

      selectorRecords.push(
        await ExecuteHandler._createSelectorPermission({
          blockNumber: info.blockNumber,
          blockTimestamp,
          selector,
          target: where,
          chainId,
          isAllowed: !laterDisallow,
          ...(laterDisallow ? { disallowed: laterDisallow.disallowed } : {}),
          ...selectorParams,
          decoded,
        }),
      )

      logger.info(allowedLog, llo({ selector, where, chainId, ...info }))
    }
    return selectorRecords
  },

  /** Clears, for each plugin on the condition, its latest allow from before this log. */
  async _disallow(
    parsedEvent: LogDescription,
    info: ILogInfo,
    selector: string | null,
    disallowedLog: string,
    notFoundLog: string,
  ) {
    const { where } = parsedEvent.args
    const chainId = ExecuteHandler._resolveChainId(parsedEvent, info.network)

    const plugins = await ExecuteHandler._conditionPlugins(info)
    if (plugins.length === 0) {
      logger.warn('Plugin not found for condition address', llo({ ...info }))
      return
    }

    const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)
    const disallowed = {
      status: true,
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      logIndex: info.logIndex,
      blockTimestamp,
    }

    for (const plugin of plugins) {
      const { modifiedCount } = await Models.SelectorPermission.updateMany(
        {
          selector,
          target: where,
          $and: [ExecuteHandler._chainIdFilter(parsedEvent, chainId), ExecuteHandler._before(info)],
          conditionAddress: info.address,
          network: info.network,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          isAllowed: true,
        },
        { $set: { isAllowed: false, disallowed } },
      )

      if (!modifiedCount) {
        // A replayed disallow finds the allows it already cleared, so nothing matches the update.
        const replayed = await Models.SelectorPermission.findOne({
          selector,
          target: where,
          ...ExecuteHandler._chainIdFilter(parsedEvent, chainId),
          conditionAddress: info.address,
          network: info.network,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          'disallowed.transactionHash': info.transactionHash,
          'disallowed.logIndex': info.logIndex,
        })
        if (replayed) continue

        logger.warn(notFoundLog, llo({ selector, where, chainId, ...info }))
        await ExecuteHandler._createSelectorPermission({
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp,
          conditionAddress: info.address,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          selector,
          target: where,
          chainId,
          isAllowed: false,
          decoded: { ...EMPTY_DECODED },
          disallowed,
        })
        continue
      }

      logger.info(disallowedLog, llo({ selector, where, chainId, ...info, disallowed }))
    }
  },

  async selectorAllowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { selector, where } = parsedEvent.args
      return await ExecuteHandler._allow(parsedEvent, info, selector, 'Selector allowed', async chainId => {
        // `where` lives on the destination chain for a cross-chain condition, so the
        // signature must be resolved there and not on the chain that emitted the log.
        const targetNetwork = ProviderModule.getNetworkByChainId(chainId)
        if (!targetNetwork) {
          logger.warn(
            'Selector allowed on an unindexed chain, skipping decode',
            llo({ selector, where, chainId, ...info }),
          )
          return { ...EMPTY_DECODED }
        }

        const selectorInfo = await ContractInfo.parseSignature(selector, where, targetNetwork)
        return selectorInfo
          ? {
              ...EMPTY_DECODED,
              functionName: selectorInfo.functionName,
              contractName: selectorInfo.contractName,
              proxyName: selectorInfo.proxyName ?? null,
              implementationAddress: selectorInfo.implementationAddress ?? null,
              inputs: selectorInfo.inputs,
              notice: selectorInfo.notice ?? null,
              stateMutability: selectorInfo.stateMutability ?? null,
            }
          : { ...EMPTY_DECODED }
      })
    } catch (error) {
      logger.error('Error processing SelectorAllowed event:', llo({ error, parsedEvent, ...info }))
    }
  },

  async selectorDisallowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      await ExecuteHandler._disallow(
        parsedEvent,
        info,
        parsedEvent.args.selector,
        'Selector disallowed',
        'Selector not found for disallowing',
      )
    } catch (error) {
      logger.error('Error processing SelectorDisallowed event', llo({ error, parsedEvent, ...info }))
    }
  },

  async nativeTransfersAllowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      return await ExecuteHandler._allow(parsedEvent, info, null, 'Native transfers allowed', async () => {
        const decoded = await ContractInfo.parseSignature(null, parsedEvent.args.where, info.network)
        return { ...EMPTY_DECODED, functionName: decoded.functionName, contractName: decoded.contractName }
      })
    } catch (error) {
      logger.error('Error processing NativeTransfersAllowed event', llo({ error, parsedEvent, ...info }))
    }
  },

  async nativeTransfersDisallowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      await ExecuteHandler._disallow(
        parsedEvent,
        info,
        null,
        'Native transfers disallowed',
        'ETH transfer permission not found for disallowing',
      )
    } catch (error) {
      logger.error('Error processing NativeTransfersDisallowed event', llo({ error, parsedEvent, ...info }))
    }
  },
}
