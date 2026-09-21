/**
 * Whether a Safe is one of ours.
 *
 * Safe events are matched network-wide by topic, so every owner change and every execution on the
 * chain reaches a handler and almost none of them are about a Safe we know. This is the gate that
 * decides, and it runs before any work, so it has to be cheap on the common answer: no.
 *
 * Sources are ordered by what they cost. A `Plugin` lookup is one hit on an indexed address. The
 * settings query walks a nested `$elemMatch` and only runs when the first found nothing. A
 * registered workspace account becomes the third when standalone Safes land.
 */

import { Models } from '@dbModels'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
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

  /** A Safe named as a stage body of an active SPP setting. */
  async isBody(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    const setting = await Models.Setting.exists({
      network,
      status: ISettingStatus.active,
      stages: {
        $elemMatch: {
          plugins: { $elemMatch: { address: safeAddress, brandId: VotingBodyBrandIdentity.SAFE } },
        },
      },
    })

    return setting != null
  },

  async isTracked(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    if (await SafeTrackingModule.isProcess(network, safeAddress)) return true

    return await SafeTrackingModule.isBody(network, safeAddress)
  },
}

export default SafeTrackingModule
