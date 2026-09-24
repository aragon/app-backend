/**
 * Which DAOs a Safe reaches, and how. A Safe holding execute permission on a DAO has an installed
 * `Plugin` row. A Safe named as a SAFE-branded stage body sits in an active SPP setting whose SPP
 * plugin is still installed: uninstalling the SPP leaves its settings active, so the setting alone
 * would keep answering yes after the relation has gone. A Safe can reach one DAO both ways, so the
 * two sources union and dedupe on `(network, dao, safe)`.
 *
 * Safe events are matched network-wide by topic, so `isTracked` runs before any work and must stay
 * cheap on the common answer, no: the `Plugin` lookup goes first and the settings query only runs
 * when it found nothing.
 */

import { Models } from '@dbModels'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  type ISafeBodyRelationParams,
  type NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'

export interface ISafeRelation {
  network: NetworksEnum
  daoAddress: HexAddress
  safeAddress: HexAddress
}

const processFilter = ({ network, daoAddress, safeAddresses }: ISafeBodyRelationParams) => ({
  network,
  status: IPluginStatus.installed,
  interfaceType: IPluginInterfaceType.safe,
  ...(daoAddress ? { daoAddress } : {}),
  ...(safeAddresses ? { address: { $in: safeAddresses } } : {}),
})

async function activeBodySettings(params: ISafeBodyRelationParams) {
  const { network } = params
  const settings = await Models.Setting.findActiveWithSafeBody(params)
  if (!settings.length) return []

  const installed = new Set<string>(
    await Models.Plugin.distinct('address', {
      network,
      address: { $in: settings.map(setting => setting.pluginAddress) },
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.spp,
    }),
  )

  return settings.filter(setting => installed.has(setting.pluginAddress))
}

const SafeRelationsModule = {
  /** Every `(dao, safe)` pair in scope, once, whichever way the Safe reaches the DAO. */
  async resolve(params: ISafeBodyRelationParams): Promise<ISafeRelation[]> {
    const { network, safeAddresses } = params
    if (safeAddresses && !safeAddresses.length) return []

    const wanted = safeAddresses ? new Set<string>(safeAddresses) : null
    const [processes, settings] = await Promise.all([
      Models.Plugin.find(processFilter(params)).select('address daoAddress').lean(),
      activeBodySettings(params),
    ])

    const relations = new Map<string, ISafeRelation>()
    const add = (daoAddress: HexAddress, safeAddress: HexAddress) => {
      if (daoAddress && safeAddress) {
        relations.set(`${network}-${daoAddress}-${safeAddress}`, { network, daoAddress, safeAddress })
      }
    }
    for (const plugin of processes) add(plugin.daoAddress as HexAddress, plugin.address as HexAddress)
    for (const setting of settings) {
      for (const stage of setting.stages ?? []) {
        for (const body of stage.plugins ?? []) {
          if (body.brandId !== VotingBodyBrandIdentity.SAFE || !body.address) continue
          if (wanted && !wanted.has(body.address)) continue
          add(setting.daoAddress as HexAddress, body.address as HexAddress)
        }
      }
    }

    return [...relations.values()]
  },

  /** Every Safe this DAO can see. */
  async getSafeAddresses(daoAddress: HexAddress, network: NetworksEnum): Promise<HexAddress[]> {
    const relations = await SafeRelationsModule.resolve({ network, daoAddress })

    return [...new Set(relations.map(relation => relation.safeAddress))]
  },

  /** Every DAO that can see these Safes. */
  async findDaos(
    safeAddresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Array<{ daoAddress: HexAddress; network: NetworksEnum }>> {
    const relations = await SafeRelationsModule.resolve({ network, safeAddresses })
    const daos = new Map<string, { daoAddress: HexAddress; network: NetworksEnum }>()
    for (const { daoAddress } of relations) daos.set(daoAddress, { daoAddress, network })

    return [...daos.values()]
  },

  async isTracked(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    if (await Models.Plugin.exists(processFilter({ network, safeAddresses: [safeAddress] }))) return true

    return (await activeBodySettings({ network, safeAddresses: [safeAddress] })).length > 0
  },
}

export default SafeRelationsModule
