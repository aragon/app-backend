import { Models } from '@dbModels'
import { retryRequest } from '@helpers/retryRequest'
import Utils from '@helpers/utils'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import type { CrossChainSetting } from '@models/schema/setting'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type ILogInfo, IPluginInterfaceType, ISettingStatus, type NetworksEnum } from '@types'
import { Contract, type LogDescription } from 'ethers'
import { ProxyToken } from '@modules/proxyToken'

const llo = logger.logMeta.bind(null, { service: 'handler:CrossChainHandler' })

type SettingWithCrossChain = Setting & { crossChain: CrossChainSetting }

export const CrossChainHandler = {
  _getOrCreateSetting: async (info: ILogInfo): Promise<SettingWithCrossChain | null> => {
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
        }
      }
      return existing as SettingWithCrossChain
    }

    const setting = await Models.Setting.create({
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
    return setting as SettingWithCrossChain
  },

  _readFeeToken: async (adapterAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const adapter = new Contract(adapterAddress, ['function FEE_TOKEN() view returns (address)'], provider)
      const feeToken = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => adapter.FEE_TOKEN()),
      )
      return feeToken as HexAddress
    } catch (error) {
      logger.warn('CrossChain: cannot read adapter fee token', llo({ adapterAddress, network, error }))
      return null
    }
  },

  configUpdated: async (event: LogDescription, info: ILogInfo) => {
    const setting = await CrossChainHandler._getOrCreateSetting(info)
    if (!setting) return

    const chainId = Number(event.args.chainId)
    const localAdapter = event.args.localAdapter as HexAddress
    const remoteAdapter = event.args.remoteAdapter as HexAddress

    const lanes = (setting.crossChain.lanes || []).filter(lane => lane.chainId !== chainId)
    const cleared = localAdapter === Utils.zeroAddress && remoteAdapter === Utils.zeroAddress

    if (!cleared) {
      const feeToken = await CrossChainHandler._readFeeToken(localAdapter, info.network)
      if (feeToken) {
        await ProxyToken.saveAndGetToken(feeToken, info.network)
      }
      lanes.push({ chainId, localAdapter, remoteAdapter, feeToken })
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
    setting.crossChain.executorIsDao = !!setting.daoAddress && newExecutor === setting.daoAddress
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
