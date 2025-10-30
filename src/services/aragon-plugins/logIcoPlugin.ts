import logger from '@logger'
import { type ILogInfo, IPluginInterfaceType } from '@types'
import type Plugin from '@models/schema/plugin'
import type Token from '@models/schema/token'
import Web3Helper from '@helpers/web3'
import { IcoPlugin } from '@artifacts/IcoPlugin'
import Web3Utils from '@helpers/web3Utils'
import type { LogDescription, TransactionReceipt } from 'ethers'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'

const llo = logger.logMeta.bind(null, { service: 'services:aragon-plugins:LogIcoPlugin' })

const LogIcoPlugin = {
  start: async (plugin: Plugin, token?: Token, isHistorical?: boolean) => {
    if (plugin.interfaceType !== IPluginInterfaceType.ico) {
      logger.warn('Plugin is not ico', llo({ plugin: plugin.address }))
      return
    }

    logger.verbose('Start LogIcoPlugin', llo({ plugin: plugin.address, isHistorical }))

    try {
      // Update plugin isSupported status
      const isSupported = !!token?.isGovernance
      if (plugin.isSupported !== isSupported) {
        plugin.isSupported = isSupported
        await plugin.save()
      }

      // Process logs from the plugin creation block to the current block
      const currentBlock = await Web3Helper.getBlockNumber(undefined, plugin.network)
      if (!currentBlock) return

      const fromBlock = isHistorical ? plugin.blockNumber : currentBlock
      const toBlock = currentBlock

      // Get logs using Web3Helper.getLogs
      const logsResponse = await Web3Helper.getLogs(
        {
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          topics: [],
        },
        plugin.network,
      )

      if (!logsResponse) {
        logger.warn('No logs found for ICO plugin', llo({ plugin: plugin.address }))
        return
      }

      const txReceipts: Record<string, TransactionReceipt | null> = {}
      const processLogs = async (log: any) => {
        const info: ILogInfo = {
          logIndex: log.logIndex,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          network: plugin.network,
          address: plugin.address,
          transactionIndex: log.transactionIndex,
          eventName: '', // Will be set when processing specific events
        }

        // Get transaction receipt if not already fetched
        if (!txReceipts[log.transactionHash]) {
          txReceipts[log.transactionHash] = await Web3Helper.getTransactionReceipt(log.transactionHash, plugin.network)
        }

        const txReceipt = txReceipts[log.transactionHash]
        if (!txReceipt) return

        // Handle plugin settings
        await PluginSettingHandler.handlePluginSettingByType(plugin, txReceipt, info)

        // Handle specific ICO events
        await LogIcoPlugin.handleIcoEvents(log, plugin, info)
      }

      // Process logs sequentially
      for (const log of logsResponse) {
        await processLogs(log)
      }

      logger.verbose('End LogIcoPlugin', llo({ plugin: plugin.address }))
    } catch (error) {
      logger.error('Error LogIcoPlugin', llo({ plugin: plugin.address, error }))
    }
  },

  handleIcoEvents: async (log: any, plugin: Plugin, info: ILogInfo) => {
    try {
      const parsedLog = Web3Utils.parseLog(log, IcoPlugin.abi)
      if (!parsedLog) return

      switch (parsedLog.name) {
        case 'MetadataSet':
          await LogIcoPlugin.handleMetadataSet(parsedLog, plugin, info)
          break
        case 'TargetSet':
          await LogIcoPlugin.handleTargetSet(parsedLog, plugin, info)
          break
        case 'TokensExchanged':
          await LogIcoPlugin.handleTokensExchanged(parsedLog, plugin, info)
          break
        case 'TradingPairCreated':
          await LogIcoPlugin.handleTradingPairCreated(parsedLog, plugin, info)
          break
        case 'TradingPairRemoved':
          await LogIcoPlugin.handleTradingPairRemoved(parsedLog, plugin, info)
          break
        case 'TradingPairStatusChanged':
          await LogIcoPlugin.handleTradingPairStatusChanged(parsedLog, plugin, info)
          break
        case 'TradingPairUpdated':
          await LogIcoPlugin.handleTradingPairUpdated(parsedLog, plugin, info)
          break
        case 'Upgraded':
          await LogIcoPlugin.handleUpgraded(parsedLog, plugin, info)
          break
      }
    } catch (error) {
      logger.error('Error parsing ICO event', llo({ error, info }))
    }
  },

  handleMetadataSet: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle metadata set event
      logger.verbose(
        'ICO MetadataSet event',
        llo({
          info,
          metadata: parsedEvent.args.metadata,
        }),
      )

      // Update plugin metadata if needed
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling MetadataSet event', llo({ error, info }))
    }
  },

  handleTargetSet: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle target set event
      const targetConfig = parsedEvent.args.newTargetConfig
      logger.verbose(
        'ICO TargetSet event',
        llo({
          info,
          target: targetConfig.target,
          operation: targetConfig.operation,
        }),
      )

      // Update plugin target config if needed
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling TargetSet event', llo({ error, info }))
    }
  },

  handleSupportedTokenUpdated: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle supported token updated event
      const tokenId = parsedEvent.args.id.toString()
      const tokenAddress = parsedEvent.args.tokenAddress
      const active = parsedEvent.args.active

      logger.verbose(
        'ICO SupportedTokenUpdated event',
        llo({
          info,
          tokenId,
          tokenAddress,
          active,
        }),
      )

      // Save or update supported token information
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling SupportedTokenUpdated event', llo({ error, info }))
    }
  },

  handleTokensExchanged: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle tokens exchanged event
      const user = parsedEvent.args.user
      const tradingPairId = parsedEvent.args.tradingPairId.toString()
      const tokenAAmount = parsedEvent.args.tokenAAmount.toString()
      const tokenBAmount = parsedEvent.args.tokenBAmount.toString()
      const timestamp = parsedEvent.args.timestamp.toString()

      logger.verbose(
        'ICO TokensExchanged event',
        llo({
          info,
          user,
          tradingPairId,
          tokenAAmount,
          tokenBAmount,
          timestamp,
        }),
      )

      // Save token exchange information
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling TokensExchanged event', llo({ error, info }))
    }
  },

  handleTradingPairCreated: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle trading pair created event
      const tradingPairId = parsedEvent.args.tradingPairId.toString()
      const tokenA = parsedEvent.args.tokenA
      const tokenB = parsedEvent.args.tokenB
      const rate = parsedEvent.args.rate.toString()
      const tokenASaleAmount = parsedEvent.args.tokenASaleAmount.toString()
      const startDate = parsedEvent.args.startDate.toString()
      const endDate = parsedEvent.args.endDate.toString()
      const pairType = parsedEvent.args.pairType.toString()

      logger.verbose(
        'ICO TradingPairCreated event',
        llo({
          info,
          tradingPairId,
          tokenA,
          tokenB,
          rate,
          tokenASaleAmount,
          startDate,
          endDate,
          pairType,
        }),
      )

      // Save trading pair information
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling TradingPairCreated event', llo({ error, info }))
    }
  },

  handleTradingPairRemoved: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle trading pair removed event
      const tradingPairId = parsedEvent.args.tradingPairId.toString()

      logger.verbose(
        'ICO TradingPairRemoved event',
        llo({
          info,
          tradingPairId,
        }),
      )

      // Remove trading pair information
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling TradingPairRemoved event', llo({ error, info }))
    }
  },

  handleTradingPairStatusChanged: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle trading pair status changed event
      const tradingPairId = parsedEvent.args.tradingPairId.toString()
      const active = parsedEvent.args.active

      logger.verbose(
        'ICO TradingPairStatusChanged event',
        llo({
          info,
          tradingPairId,
          active,
        }),
      )

      // Update trading pair status information
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling TradingPairStatusChanged event', llo({ error, info }))
    }
  },

  handleTradingPairUpdated: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle trading pair updated event
      const tradingPairId = parsedEvent.args.tradingPairId.toString()
      const rate = parsedEvent.args.rate.toString()
      const tokenASaleAmount = parsedEvent.args.tokenASaleAmount.toString()
      const startDate = parsedEvent.args.startDate.toString()
      const endDate = parsedEvent.args.endDate.toString()
      const active = parsedEvent.args.active
      const pairType = parsedEvent.args.pairType.toString()

      logger.verbose(
        'ICO TradingPairUpdated event',
        llo({
          info,
          tradingPairId,
          rate,
          tokenASaleAmount,
          startDate,
          endDate,
          active,
          pairType,
        }),
      )

      // Update trading pair information
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling TradingPairUpdated event', llo({ error, info }))
    }
  },

  handleUpgraded: async (parsedEvent: LogDescription, plugin: Plugin, info: ILogInfo) => {
    try {
      // Handle upgraded event
      const implementation = parsedEvent.args.implementation

      logger.verbose(
        'ICO Upgraded event',
        llo({
          info,
          implementation,
        }),
      )

      // Handle upgrade if needed
      // This is just a placeholder - implement based on your specific needs
    } catch (error) {
      logger.error('Error handling Upgraded event', llo({ error, info }))
    }
  },
}

export { LogIcoPlugin }
