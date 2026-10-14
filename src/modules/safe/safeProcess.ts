import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import { type HexAddress, IEventLogPermission, type ILogInfo, IPluginStatus, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeProcess' })

/** A Safe holding execute on a DAO is a process of that DAO. */
const SafeProcessModule = {
  async findRow(address: HexAddress, daoAddress: HexAddress, network: NetworksEnum): Promise<Plugin | null> {
    return Models.Plugin.findSafeRow({ address, daoAddress, network })
  },

  /** Never throws: the caller still needs to save the permission. */
  async install(daoAddress: HexAddress, safeAddress: HexAddress, info: ILogInfo): Promise<Plugin | false | undefined> {
    try {
      const result = await SafeDaoAssociationsModule.reconcileDao(daoAddress, info.network, info, {
        safeAddress,
        event: IEventLogPermission.Granted,
      })
      const plugin = await SafeProcessModule.findRow(safeAddress, daoAddress, info.network)
      if (!plugin || plugin.status !== IPluginStatus.installed || !plugin.isProcess)
        return result.failed ? false : undefined
      if (!(await Models.PluginSlug.findPluginSlug(safeAddress, daoAddress, info.network))) return false

      await SafeProcessModule._afterInstall(plugin, info)
      return result.failed ? false : plugin
    } catch (error) {
      logger.error(
        'Unable to register Safe process, rerun registerSafeProcesses',
        llo({ daoAddress, safeAddress, info, error }),
      )
      return false
    }
  },

  async _afterInstall(plugin: Plugin, info: ILogInfo): Promise<void> {
    await SafeBodyMembersModule.seedDao(plugin.daoAddress, info.network)
    if (await Models.Plugin.hasInstalledSafeRowElsewhere(plugin.address, plugin.daoAddress, info.network)) return
    await SafeDaoAssociationsModule.queueBackfill(info.network, plugin.address)
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
