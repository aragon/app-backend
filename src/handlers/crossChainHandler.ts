import { Models } from '@dbModels'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import { type HexAddress, type ILogInfo, IPluginInterfaceType, ISettingStatus } from '@types'
import type { LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handler:CrossChainHandler' })

const ZERO = '0x0000000000000000000000000000000000000000'

/** Persists the current `CrossChainController` configuration. */
export const CrossChainHandler = {
  // Each configuration event can be the first one processed for the plugin.
  _getOrCreateSetting: async (info: ILogInfo): Promise<Setting | null> => {
    const pluginAddress = info.address
    const network = info.network

    const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
    if (!plugin) {
      logger.warn('CrossChain: plugin not found for setting', llo({ pluginAddress, network }))
      return null
    }

    if (plugin.interfaceType !== IPluginInterfaceType.crossChainController) {
      logger.warn(
        'CrossChain: event on a plugin that is not a crossChainController',
        llo({ pluginAddress, network, interfaceType: plugin.interfaceType }),
      )
      return null
    }

    const existing = await Models.Setting.findActive({ pluginAddress, network })
    if (existing) {
      if (!existing.crossChain) {
        existing.crossChain = {
          executor: null,
          executorIsDao: false,
          lanes: [],
          minFailedMessageGas: null,
        } as any
      }
      return existing
    }

    return await Models.Setting.create({
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      network,
      status: ISettingStatus.active,
      daoAddress: plugin.daoAddress,
      pluginAddress,
      crossChain: {
        executor: null,
        executorIsDao: false,
        lanes: [],
        minFailedMessageGas: null,
      },
    })
  },

  // `chainId` identifies the remote chain. Two zero adapters clear the lane.
  configUpdated: async (event: LogDescription, info: ILogInfo) => {
    const setting = await CrossChainHandler._getOrCreateSetting(info)
    if (!setting) return

    const chainId = Number(event.args.chainId)
    const localAdapter = event.args.localAdapter as HexAddress
    const remoteAdapter = event.args.remoteAdapter as HexAddress

    const lanes = (setting.crossChain.lanes || []).filter(lane => lane.chainId !== chainId)
    const cleared = localAdapter === ZERO && remoteAdapter === ZERO

    if (!cleared) {
      lanes.push({ chainId, localAdapter, remoteAdapter })
    }

    setting.crossChain.lanes = lanes.sort((a, b) => a.chainId - b.chainId)
    setting.markModified('crossChain')
    await setting.save()

    logger.info(
      cleared ? 'CrossChain: lane cleared' : 'CrossChain: lane configured',
      llo({ pluginAddress: info.address, network: info.network, chainId, localAdapter, remoteAdapter }),
    )
  },

  executorUpdated: async (event: LogDescription, info: ILogInfo) => {
    const setting = await CrossChainHandler._getOrCreateSetting(info)
    if (!setting) return

    const newExecutor = event.args.newExecutor as HexAddress

    setting.crossChain.executor = newExecutor
    setting.crossChain.executorIsDao =
      !!setting.daoAddress && newExecutor.toLowerCase() === setting.daoAddress.toLowerCase()
    setting.markModified('crossChain')
    await setting.save()

    logger.info(
      'CrossChain: executor updated',
      llo({
        pluginAddress: info.address,
        network: info.network,
        newExecutor,
        executorIsDao: setting.crossChain.executorIsDao,
      }),
    )
  },

  minFailedMessageGasUpdated: async (event: LogDescription, info: ILogInfo) => {
    const setting = await CrossChainHandler._getOrCreateSetting(info)
    if (!setting) return

    const minFailedMessageGas = event.args.newMinFailedMessageGas.toString()

    setting.crossChain.minFailedMessageGas = minFailedMessageGas
    setting.markModified('crossChain')
    await setting.save()

    logger.info(
      'CrossChain: min failed message gas updated',
      llo({ pluginAddress: info.address, network: info.network, minFailedMessageGas }),
    )
  },
}
