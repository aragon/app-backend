import { type LogDescription } from 'ethers'
import { type ILogInfo, IPluginStatus } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'handlers:SelectorPermissionHandler' })

export const SelectorPermissionHandler = {
  async selectorAllowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { selector, where } = parsedEvent.args as any
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

      const selectorRecord = await Models.SelectorPermission.create({
        blockNumber,
        blockTimestamp,
        pluginAddress: plugin.address,
        daoAddress: plugin.daoAddress,
        selector,
        target: where,
        isAllowed: true,
        ...selectorParams,
      })

      logger.info(`Selector allowed: ${selector} for target ${where} in condition ${info.address}`)
      return selectorRecord
    } catch (error) {
      logger.error(`Error processing SelectorAllowed event: ${error}`)
    }
  },

  async selectorDisallowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { selector, where } = parsedEvent.args as any

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
        selector,
        target: where,
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
          ...info,
          disallowed: existingSelector.disallowed,
        }),
      )
    } catch (error) {
      logger.error('Error processing SelectorDisallowed event:', llo({ error, parsedEvent, info }))
    }
  },

  async ethTransfersAllowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { where } = parsedEvent.args as any
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

      const selectorRecord = await Models.SelectorPermission.create({
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
        isAllowed: true,
      })

      logger.info(`ETH transfers allowed for target ${where} in condition ${info.address}`)
      return selectorRecord
    } catch (error) {
      logger.error(`Error processing EthTransfersAllowed event: ${error}`)
    }
  },

  async ethTransfersDisallowed(parsedEvent: LogDescription, info: ILogInfo) {
    try {
      const { where } = parsedEvent.args as any

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
        'ETH transfers disallowed',
        llo({
          where,
          ...info,
          disallowed: existingSelector.disallowed,
        }),
      )
    } catch (error) {
      logger.error('Error processing EthTransfersDisallowed event:', llo({ error, parsedEvent, info }))
    }
  },
}
