import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type SelectorPermission from '@models/schema/selectorPermission'
import type { ActionDecoded } from '@models/schema/selectorPermission'
import DbTx from '@modules/dbTx'
import ProviderModule from '@modules/provider'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { type ILogInfo, IPluginStatus, type ISelectorPermissionIdParams, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'

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
   * index on the entity id settles it; the one that loses reads back the row instead of failing
   * the message.
   */
  async _createSelectorPermission(payload: Partial<SelectorPermission>, selectorParams: ISelectorPermissionIdParams) {
    try {
      return await Models.SelectorPermission.create(payload)
    } catch (error) {
      if (!DbTx.isErrorDuplicateKey(error)) throw error
      return await Models.SelectorPermission.findExistingLog(selectorParams)
    }
  },

  async selectorAllowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { selector, where } = parsedEvent.args
      const chainId = ExecuteHandler._resolveChainId(parsedEvent, info.network)
      const { network, transactionHash, transactionIndex, logIndex, blockNumber } = info

      const plugin = await Models.Plugin.findOne({
        conditionAddress: info.address,
        network: info.network,
        status: IPluginStatus.installed,
      })

      if (!plugin) return

      const selectorParams = {
        network,
        transactionHash,
        transactionIndex,
        logIndex,
        conditionAddress: info.address,
      }

      const existingSelector = await Models.SelectorPermission.findExistingLog(selectorParams)
      if (existingSelector) return

      const blockTimestamp = await Web3Helper.getBlockTimestamp(blockNumber, network)

      // `where` lives on the destination chain for a cross-chain condition, so the
      // signature must be resolved there and not on the chain that emitted the log.
      const targetNetwork = ProviderModule.getNetworkByChainId(chainId)
      const selectorInfo = targetNetwork ? await ContractInfo.parseSignature(selector, where, targetNetwork) : null

      if (!targetNetwork) {
        logger.warn(
          'Selector allowed on an unindexed chain, skipping decode',
          llo({ selector, where, chainId, ...info }),
        )
      }

      const decoded: ActionDecoded = selectorInfo
        ? {
            ...EMPTY_DECODED,
            functionName: selectorInfo.functionName,
            contractName: selectorInfo.contractName,
            proxyName: selectorInfo.proxyName ?? null,
            implementationAddress: selectorInfo.implementationAddress ?? null,
            inputs: selectorInfo.inputs,
            notice: selectorInfo.notice ?? null,
          }
        : { ...EMPTY_DECODED }

      const selectorRecord = await ExecuteHandler._createSelectorPermission(
        {
          blockNumber,
          blockTimestamp,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          selector,
          target: where,
          chainId,
          isAllowed: true,
          ...selectorParams,
          decoded,
        },
        selectorParams,
      )

      logger.info(
        'Selector allowed',
        llo({
          selector,
          where,
          chainId,
          ...info,
        }),
      )
      return selectorRecord
    } catch (error) {
      logger.error('Error processing SelectorAllowed event:', llo({ error, parsedEvent, ...info }))
    }
  },

  async selectorDisallowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { selector, where } = parsedEvent.args
      const chainId = ExecuteHandler._resolveChainId(parsedEvent, info.network)

      const plugin = await Models.Plugin.findOne({
        conditionAddress: info.address,
        network: info.network,
        status: IPluginStatus.installed,
      })

      if (!plugin) {
        logger.warn(
          'Plugin not found for condition address',
          llo({
            ...info,
          }),
        )
        return
      }

      // Scoped by chainId: the same selector/target pair can be allowed on several
      // destination chains, and disallowing one must not clear the others.
      const existingSelector = await Models.SelectorPermission.findOne({
        selector,
        target: where,
        ...ExecuteHandler._chainIdFilter(parsedEvent, chainId),
        conditionAddress: info.address,
        network: info.network,
        pluginAddress: plugin.address,
        isAllowed: true,
      })

      if (!existingSelector) {
        logger.warn(
          'Selector not found for disallowing',
          llo({
            selector,
            where,
            chainId,
            ...info,
          }),
        )
        return
      }

      await existingSelector.update({
        isAllowed: false,
        disallowed: {
          status: true,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp: await Web3Helper.getBlockTimestamp(info.blockNumber, info.network),
        },
      })

      logger.info(
        'Selector disallowed',
        llo({
          selector,
          where,
          chainId,
          ...info,
          disallowed: existingSelector.disallowed,
        }),
      )
    } catch (error) {
      logger.error('Error processing SelectorDisallowed event', llo({ error, parsedEvent, ...info }))
    }
  },

  async nativeTransfersAllowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { where } = parsedEvent.args
      const chainId = ExecuteHandler._resolveChainId(parsedEvent, info.network)
      const { network, transactionHash, transactionIndex, logIndex, blockNumber } = info

      const plugin = await Models.Plugin.findOne({
        conditionAddress: info.address,
        network: info.network,
        status: IPluginStatus.installed,
      })

      if (!plugin) {
        logger.warn(
          'Plugin not found for condition address',
          llo({
            ...info,
          }),
        )
        return
      }

      const selectorParams = {
        network,
        transactionHash,
        transactionIndex,
        logIndex,
        conditionAddress: info.address,
      }

      const existingSelector = await Models.SelectorPermission.findExistingLog(selectorParams)
      if (existingSelector) return

      const blockTimestamp = await Web3Helper.getBlockTimestamp(blockNumber, network)

      const decoded = await ContractInfo.parseSignature(null, where, network)

      const selectorRecord = await ExecuteHandler._createSelectorPermission(
        {
          network,
          transactionHash,
          transactionIndex,
          logIndex,
          blockNumber,
          blockTimestamp,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          conditionAddress: info.address,
          selector: null,
          target: where,
          chainId,
          isAllowed: true,
          decoded: {
            ...EMPTY_DECODED,
            functionName: decoded.functionName,
            contractName: decoded.contractName,
          },
        },
        selectorParams,
      )

      logger.info(
        'Native transfers allowed',
        llo({
          where,
          ...info,
        }),
      )
      return selectorRecord
    } catch (error) {
      logger.error('Error processing NativeTransfersAllowed event', llo({ error, parsedEvent, ...info }))
    }
  },

  async nativeTransfersDisallowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { where } = parsedEvent.args
      const chainId = ExecuteHandler._resolveChainId(parsedEvent, info.network)

      const plugin = await Models.Plugin.findOne({
        conditionAddress: info.address,
        network: info.network,
        status: IPluginStatus.installed,
      })

      if (!plugin) {
        logger.warn(
          'Plugin not found for condition address',
          llo({
            ...info,
          }),
        )
        return
      }

      const existingSelector = await Models.SelectorPermission.findOne({
        selector: null,
        target: where,
        ...ExecuteHandler._chainIdFilter(parsedEvent, chainId),
        conditionAddress: info.address,
        network: info.network,
        pluginAddress: plugin.address,
        isAllowed: true,
      })

      if (!existingSelector) {
        logger.warn(
          'ETH transfer permission not found for disallowing',
          llo({
            where,
            ...info,
          }),
        )
        return
      }

      await existingSelector.update({
        isAllowed: false,
        disallowed: {
          status: true,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp: await Web3Helper.getBlockTimestamp(info.blockNumber, info.network),
        },
      })

      logger.info(
        'Native transfers disallowed',
        llo({
          where,
          ...info,
          disallowed: existingSelector.disallowed,
        }),
      )
    } catch (error) {
      logger.error('Error processing NativeTransfersDisallowed event', llo({ error, parsedEvent, ...info }))
    }
  },
}
