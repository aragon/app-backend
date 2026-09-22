/**
 * Whether a Safe is one of ours. Safe events are matched network-wide by topic, so this gate runs
 * before any work and must be cheap on the common answer, no. The `Plugin` lookup goes first; the
 * settings `$elemMatch` only runs when it found nothing.
 */

import { Models } from '@dbModels'
import type Setting from '@models/schema/setting'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  type ISafeBodyRelationParams,
  ISettingStatus,
  type NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'

const SafeTrackingModule = {
  /** A Safe holding execute permission on a DAO, which gives it an installed plugin row. */
  async isProcess(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    const plugin = await Models.Plugin.exists({
      address: safeAddress,
      network,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
    })

    return plugin != null
  },

  /**
   * Active SPP settings naming a Safe as a stage body, whose SPP plugin is still installed.
   *
   * Uninstalling the SPP leaves its settings active, so the setting alone keeps answering yes long
   * after the relation has gone. The nested elemMatch keeps the address and the SAFE brand paired on
   * the same body rather than matching two different bodies.
   */
  async activeSafeBodySettings({ network, daoAddress, safeAddresses }: ISafeBodyRelationParams): Promise<Setting[]> {
    const body = safeAddresses
      ? { address: { $in: safeAddresses }, brandId: VotingBodyBrandIdentity.SAFE }
      : { address: { $ne: null }, brandId: VotingBodyBrandIdentity.SAFE }
    const settings = await Models.Setting.find({
      network,
      status: ISettingStatus.active,
      ...(daoAddress ? { daoAddress } : {}),
      stages: { $elemMatch: { plugins: { $elemMatch: body } } },
    })
    if (!settings.length) return []

    const installedSppPlugins = await Models.Plugin.distinct('address', {
      network,
      address: { $in: settings.map(setting => setting.pluginAddress) },
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.spp,
    })
    const installed = new Set<string>(installedSppPlugins)

    return settings.filter(setting => installed.has(setting.pluginAddress))
  },

  /** A Safe named as a stage body of an active SPP setting whose plugin is still installed. */
  async isBody(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    const settings = await SafeTrackingModule.activeSafeBodySettings({ network, safeAddresses: [safeAddress] })

    return settings.length > 0
  },

  async isTracked(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    if (await SafeTrackingModule.isProcess(network, safeAddress)) return true

    return await SafeTrackingModule.isBody(network, safeAddress)
  },
}

export default SafeTrackingModule
