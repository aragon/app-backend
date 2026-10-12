import config from '@config'
import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginStatus,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeProcess' })

/** A Safe holding execute on a DAO is a process of that DAO. */
const SafeProcessModule = {
  async findRow(address: HexAddress, daoAddress: HexAddress, network: NetworksEnum): Promise<Plugin | null> {
    return Models.Plugin.findSafeRow({ address, daoAddress, network })
  },

  /** Never throws: the caller writes the DaoPermission row after this. */
  async install(daoAddress: HexAddress, safeAddress: HexAddress, info: ILogInfo): Promise<Plugin | undefined> {
    try {
      await SafeDaoAssociationsModule.reconcileDao(daoAddress, info.network, info, {
        safeAddress,
        event: IEventLogPermission.Granted,
      })
      const plugin = await SafeProcessModule.findRow(safeAddress, daoAddress, info.network)
      if (!plugin) return

      if (plugin.status === IPluginStatus.installed && plugin.isProcess) {
        await SafeProcessModule._afterInstall(plugin, info)
      }
      return plugin
    } catch (error) {
      logger.error(
        'Unable to register Safe process, rerun registerSafeProcesses',
        llo({ daoAddress, safeAddress, info, error }),
      )
    }
  },

  async _afterInstall(plugin: Plugin, info: ILogInfo): Promise<void> {
    await SafeBodyMembersModule.seedDao(plugin.daoAddress, info.network)

    // The id carries the depth so a shallow poll cannot dedupe the backfill away, even on reinstall.
    const historyPages = config.SAFE_API.BACKFILL_HISTORY_PAGES
    await RabbitMQHelper.sendMessage(EnumQueueName.safeRefresh, {
      id: `safe-refresh-${info.network}-${plugin.address}-${historyPages}`,
      params: { network: info.network, address: plugin.address, historyPages },
    })
  },

  async uninstall(plugin: Plugin, info: ILogInfo): Promise<Plugin | undefined> {
    try {
      if (info.address !== plugin.daoAddress) {
        logger.warn(
          'Ignoring Safe revoke from a foreign emitter',
          llo({
            safeAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            emitter: info.address,
            network: plugin.network,
          }),
        )
        return undefined
      }

      await SafeDaoAssociationsModule.reconcileDao(plugin.daoAddress, plugin.network, info, {
        safeAddress: plugin.address,
        event: IEventLogPermission.Revoked,
      })
      await BaseGovernance.requestDaoMetrics(plugin.daoAddress, plugin.network)
      return (await SafeProcessModule.findRow(plugin.address, plugin.daoAddress, plugin.network)) ?? undefined
    } catch (error) {
      logger.error(
        'Error Uninstall Plugin',
        llo({ pluginAddress: plugin.address, daoAddress: plugin.daoAddress, network: plugin.network, info, error }),
      )
    }
  },
}

export default SafeProcessModule
