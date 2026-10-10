import config from '@config'
import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import { PluginSlug } from '@helpers/pluginSlug'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import DbOperations from '@models/utils/dbOperations'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { EnumQueueName, type HexAddress, type ILogInfo, IPluginInterfaceType, IPluginStatus } from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeProcess' })

/** A Safe holding execute on a DAO is a process of that DAO. */
const SafeProcessModule = {
  /** Never throws: the caller writes the DaoPermission row after this. */
  async install(daoAddress: HexAddress, safeAddress: HexAddress, info: ILogInfo): Promise<Plugin | undefined> {
    try {
      const dao = await Models.Dao.findByAddress(daoAddress, info.network)
      if (!dao) return

      const plugin = await SafeProcessModule._getOrCreate(daoAddress, safeAddress, info)
      if (!plugin) return

      await SafeProcessModule._afterInstall(plugin, info)
      return plugin
    } catch (error) {
      logger.error(
        'Unable to register Safe process, rerun registerSafeProcesses',
        llo({ daoAddress, safeAddress, info, error }),
      )
    }
  },

  async _getOrCreate(daoAddress: HexAddress, safeAddress: HexAddress, info: ILogInfo): Promise<Plugin | null> {
    const existing = await Models.Plugin.findOne({ address: safeAddress, daoAddress, network: info.network })
    if (!existing) return await SafeProcessModule._create(daoAddress, safeAddress, info)
    if (existing.interfaceType !== IPluginInterfaceType.safe) return null
    if (existing.status !== IPluginStatus.installed) {
      return await DbOperations.updateDocument(
        existing,
        {
          status: IPluginStatus.installed,
          uninstalled: { status: false },
          conditionAddress: null,
          conditionInterfaceType: null,
        },
        { logId: existing.id, info },
        'Reinstall Safe process',
        llo,
      )
    }
    return existing
  },

  async _create(daoAddress: HexAddress, safeAddress: HexAddress, info: ILogInfo): Promise<Plugin | null> {
    if (!(await SafeChainReaderModule.isSafe(info.network, safeAddress))) return null

    const document: Partial<Plugin> = {
      id: `${info.network}-${info.transactionHash}-${safeAddress}-${daoAddress}`,
      status: IPluginStatus.installed,
      network: info.network,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      transactionHash: info.transactionHash,
      address: safeAddress,
      daoAddress,
      interfaceType: IPluginInterfaceType.safe,
      isSupported: true,
      isProcess: true,
      isBody: false,
      isSubPlugin: false,
    }

    return await DbOperations.createDocument(Models.Plugin, document, info, 'New Safe process', llo)
  },

  async _afterInstall(plugin: Plugin, info: ILogInfo): Promise<void> {
    await PluginSlug.generateSlug(plugin)
    await SafeBodyMembersModule.seedDao(plugin.daoAddress, info.network)

    // The id carries the depth so a shallow poll cannot dedupe the backfill away, even on reinstall.
    const historyPages = config.SAFE_API.BACKFILL_HISTORY_PAGES
    await RabbitMQHelper.sendMessage(EnumQueueName.safeRefresh, {
      id: `safe-refresh-${info.network}-${plugin.address}-${historyPages}`,
      params: { network: info.network, address: plugin.address, historyPages },
    })
  },

  /** A Safe never goes through the setup processor, so the revoke alone uninstalls it. */
  async uninstall(plugin: Plugin, info: ILogInfo): Promise<Plugin | undefined> {
    try {
      const updatedDocument = {
        status: IPluginStatus.uninstalled,
        uninstalled: {
          status: true,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, plugin.network)) || undefined,
        },
      }

      const uninstalledPlugin = await DbOperations.updateDocument(
        plugin,
        updatedDocument,
        { logId: plugin.id, info },
        'Uninstall plugin',
        llo,
      )

      await PluginSlug.deleteSlug(uninstalledPlugin)
      await BaseGovernance.requestDaoMetrics(plugin.daoAddress, plugin.network)
      return uninstalledPlugin
    } catch (error) {
      logger.error(
        'Error Uninstall Plugin',
        llo({ pluginAddress: plugin.address, daoAddress: plugin.daoAddress, network: plugin.network, info, error }),
      )
    }
  },
}

export default SafeProcessModule
