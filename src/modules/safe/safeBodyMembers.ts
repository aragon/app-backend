import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import DbTx from '@modules/dbTx'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeTrackingModule from '@modules/safe/safeTracking'
import { BaseGovernance } from '@src/governance'
import {
  EnumQueueName,
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  type NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBodyMembers' })

type SafeBodyRelationParams = {
  network: NetworksEnum
  daoAddress?: HexAddress
  safeAddresses?: HexAddress[]
}

const requestDaoMetrics = async (daoAddress: HexAddress, network: NetworksEnum) => {
  try {
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: daoAddress,
      params: { address: daoAddress, network },
    })
  } catch (error) {
    logger.warn('Unable to enqueue DAO metrics refresh for Safe membership', llo({ daoAddress, network, error }))
  }
}

/**
 * Active SPP settings are the source of Safe-to-DAO visibility. The nested elemMatch keeps the Safe
 * address and SAFE brand paired on the same body rather than matching two different bodies.
 */
const findActiveSafeBodySettings = async ({
  network,
  daoAddress,
  safeAddresses,
}: SafeBodyRelationParams): Promise<Setting[]> => {
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
}

/**
 * The other way a Safe reaches a DAO: holding execute permission on it, which gives it an installed
 * `Plugin` row of its own. A stage body and a process are different relations and a Safe can be
 * both, so the two sources union rather than one falling back to the other.
 *
 * A registered workspace account becomes the third source when standalone Safes land.
 */
const findSafeProcessPlugins = async ({ network, daoAddress, safeAddresses }: SafeBodyRelationParams) =>
  Models.Plugin.find({
    network,
    status: IPluginStatus.installed,
    interfaceType: IPluginInterfaceType.safe,
    ...(daoAddress ? { daoAddress } : {}),
    ...(safeAddresses ? { address: { $in: safeAddresses } } : {}),
  })
    .select('address daoAddress')
    .lean()

const upsertSafeMember = async (network: NetworksEnum, safeAddress: HexAddress, memberAddress: HexAddress) => {
  await BaseGovernance.ensureBaseMember(memberAddress)
  try {
    await Models.SafeMember.updateOne(
      { network, safeAddress, memberAddress },
      {
        $setOnInsert: {
          id: `${network}-${safeAddress}-${memberAddress}`,
          network,
          safeAddress,
          memberAddress,
        },
      },
      { upsert: true },
    )
  } catch (error) {
    if (!DbTx.isErrorDuplicateKey(error)) throw error
  }
}

const SafeBodyMembersModule = {
  /** Every Safe this DAO can see, whichever way it reaches the DAO. */
  async getSafeAddresses(daoAddress: HexAddress, network: NetworksEnum): Promise<HexAddress[]> {
    const [settings, processes] = await Promise.all([
      findActiveSafeBodySettings({ daoAddress, network }),
      findSafeProcessPlugins({ daoAddress, network }),
    ])

    const addresses = new Set<HexAddress>()
    for (const setting of settings) {
      for (const stage of setting.stages ?? []) {
        for (const body of stage.plugins ?? []) {
          if (body.address && body.brandId === VotingBodyBrandIdentity.SAFE) addresses.add(body.address)
        }
      }
    }
    for (const plugin of processes) addresses.add(plugin.address as HexAddress)

    return [...addresses]
  },

  /** Every DAO that can see these Safes, whichever way each one reaches it. */
  async findDaosWithSafeBody(
    safeAddresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Array<{ daoAddress: HexAddress; network: NetworksEnum }>> {
    if (!safeAddresses.length) return []

    const [settings, processes] = await Promise.all([
      findActiveSafeBodySettings({ safeAddresses, network }),
      findSafeProcessPlugins({ safeAddresses, network }),
    ])

    const daos = new Map<string, { daoAddress: HexAddress; network: NetworksEnum }>()
    for (const setting of settings) {
      if (setting.daoAddress) daos.set(`${network}-${setting.daoAddress}`, { daoAddress: setting.daoAddress, network })
    }
    for (const plugin of processes) {
      const daoAddress = plugin.daoAddress as HexAddress
      if (daoAddress) daos.set(`${network}-${daoAddress}`, { daoAddress, network })
    }

    return [...daos.values()]
  },

  /**
   * Seed each newly visible Safe once. Existing global rows deliberately skip the chain snapshot: an
   * owner event may have populated the tuple first, and there is no retry or retraction path here.
   */
  async seedDao(daoAddress: HexAddress, network: NetworksEnum): Promise<void> {
    try {
      const safeAddresses = await SafeBodyMembersModule.getSafeAddresses(daoAddress, network)
      for (const safeAddress of safeAddresses) {
        try {
          if (await Models.SafeMember.exists({ network, safeAddress })) continue
          const owners = await SafeChainReaderModule.readOwners(network, safeAddress)
          if (!owners) continue
          const uniqueOwners = new Set<HexAddress>(owners.map(owner => getAddress(owner) as HexAddress))
          for (const owner of uniqueOwners) {
            try {
              await upsertSafeMember(network, safeAddress, owner)
            } catch (error) {
              logger.warn('Unable to seed Safe owner', llo({ daoAddress, network, safeAddress, owner, error }))
            }
          }
        } catch (error) {
          logger.warn('Unable to seed Safe body owners', llo({ daoAddress, network, safeAddress, error }))
        }
      }
    } catch (error) {
      logger.warn('Unable to discover Safe bodies for seeding', llo({ daoAddress, network, error }))
    }

    await requestDaoMetrics(daoAddress, network)
  },

  /** Add one global owner tuple, then refresh every DAO currently referring to the Safe. */
  async addOwner(network: NetworksEnum, safeAddress: HexAddress, owner: HexAddress): Promise<number> {
    let normalizedSafe: HexAddress
    let normalizedOwner: HexAddress
    try {
      normalizedSafe = getAddress(safeAddress) as HexAddress
      normalizedOwner = getAddress(owner) as HexAddress
    } catch (error) {
      logger.warn('Unable to normalize Safe owner membership', llo({ network, safeAddress, owner, error }))
      return 0
    }

    let daos: Array<{ daoAddress: HexAddress; network: NetworksEnum }> = []
    let relationDiscoverySucceeded = false
    try {
      daos = await SafeBodyMembersModule.findDaosWithSafeBody([normalizedSafe], network)
      relationDiscoverySucceeded = true
    } catch (error) {
      logger.warn('Unable to find DAOs for Safe owner metrics', llo({ network, safeAddress: normalizedSafe, error }))
    }

    if (relationDiscoverySucceeded && !daos.length) {
      try {
        const known =
          (await SafeTrackingModule.isTracked(network, normalizedSafe)) ||
          (await Models.SafeMember.exists({ network, safeAddress: normalizedSafe })) != null
        if (!known) return 0
      } catch (error) {
        logger.warn('Unable to check known Safe ownership', llo({ network, safeAddress: normalizedSafe, error }))
        return 0
      }
    }

    try {
      await upsertSafeMember(network, normalizedSafe, normalizedOwner)
    } catch (error) {
      logger.warn('Unable to add Safe owner membership', llo({ network, safeAddress, owner, error }))
      return 0
    }

    for (const { daoAddress } of daos) await requestDaoMetrics(daoAddress, network)
    return daos.length
  },

  /** Remove one global owner tuple, then refresh every DAO currently referring to the Safe. */
  async removeOwner(network: NetworksEnum, safeAddress: HexAddress, owner: HexAddress): Promise<number> {
    let normalizedSafe: HexAddress
    let normalizedOwner: HexAddress
    try {
      normalizedSafe = getAddress(safeAddress) as HexAddress
      normalizedOwner = getAddress(owner) as HexAddress
    } catch (error) {
      logger.warn('Unable to normalize Safe owner membership', llo({ network, safeAddress, owner, error }))
      return 0
    }

    let daos: Array<{ daoAddress: HexAddress; network: NetworksEnum }> = []
    let relationDiscoverySucceeded = false
    try {
      daos = await SafeBodyMembersModule.findDaosWithSafeBody([normalizedSafe], network)
      relationDiscoverySucceeded = true
    } catch (error) {
      logger.warn('Unable to find DAOs for Safe owner metrics', llo({ network, safeAddress: normalizedSafe, error }))
    }

    // Same gate as the addition. A removal we drop leaves an owner in the list who is not one any
    // more, which is the worse half of this pair to get wrong.
    if (relationDiscoverySucceeded && !daos.length) {
      try {
        const known =
          (await SafeTrackingModule.isTracked(network, normalizedSafe)) ||
          (await Models.SafeMember.exists({ network, safeAddress: normalizedSafe })) != null
        if (!known) return 0
      } catch (error) {
        logger.warn('Unable to check known Safe ownership', llo({ network, safeAddress: normalizedSafe, error }))
        return 0
      }
    }

    let deletedCount = 0
    try {
      const result = await Models.SafeMember.deleteOne({
        network,
        safeAddress: normalizedSafe,
        memberAddress: normalizedOwner,
      })
      deletedCount = result.deletedCount
    } catch (error) {
      logger.warn('Unable to remove Safe owner membership', llo({ network, safeAddress, owner, error }))
      return 0
    }

    if (!deletedCount) return 0
    logger.verbose(
      'Withdrew Safe body membership',
      llo({ network, safeAddress: normalizedSafe, owner: normalizedOwner }),
    )
    for (const { daoAddress } of daos) await requestDaoMetrics(daoAddress, network)
    return deletedCount
  },
}

export default SafeBodyMembersModule
