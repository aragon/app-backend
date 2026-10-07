import { Models } from '@dbModels'
import { PluginSlug } from '@helpers/pluginSlug'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type Setting from '@models/schema/setting'
import DbOperations from '@models/utils/dbOperations'
import DbTx from '@modules/dbTx'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { BaseGovernance } from '@src/governance'
import { IPermission } from '@src/types/permission'
import {
  EnumQueueName,
  type HexAddress,
  IEventLogPermission,
  type ILogInfo,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  type NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { id as ethersId, getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBodyMembers' })
const canonicalAddress = (address: string) => getAddress(address) as HexAddress
const addressVariants = (address: HexAddress): HexAddress[] => {
  const canonical = canonicalAddress(address)
  return [
    ...new Set<HexAddress>([
      canonical,
      canonical.toLowerCase() as HexAddress,
      `0x${canonical.slice(2).toUpperCase()}` as HexAddress,
    ]),
  ]
}
const canonicalStoredAddress = (
  address: string,
  network: NetworksEnum,
  relation: 'Safe' | 'DAO' | 'SPP',
): HexAddress | null => {
  try {
    return canonicalAddress(address)
  } catch (error) {
    logger.warn('Skipping malformed stored Safe relation address', llo({ address, network, relation, error }))
    return null
  }
}

type SafeBodyRelationParams = {
  network: NetworksEnum
  daoAddress?: HexAddress
  daoAddresses?: HexAddress[]
  safeAddresses?: HexAddress[]
}

type ReconcileDaoAssociationsOptions = {
  executeOverride?: {
    safeAddress: HexAddress
    active: boolean
  }
}

type ActiveExecuteGrant = {
  whoAddress: string
  event: IEventLogPermission
  conditionAddress?: HexAddress | null
}

const findActiveExecuteGrants = async (
  daoAddress: HexAddress,
  safeAddresses: HexAddress[],
  network: NetworksEnum,
): Promise<Map<string, ActiveExecuteGrant>> => {
  if (!safeAddresses.length) return new Map()
  const daoLower = daoAddress.toLowerCase()
  const safeAddressesLower = safeAddresses.map(address => address.toLowerCase())
  const grants = (await Models.DaoPermission.aggregate([
    {
      $match: {
        network,
        permissionId: ethersId(IPermission.EXECUTE_PERMISSION),
        $expr: {
          $and: [
            { $eq: [{ $toLower: '$daoAddress' }, daoLower] },
            { $eq: [{ $toLower: '$whereAddress' }, daoLower] },
            { $in: [{ $toLower: '$whoAddress' }, safeAddressesLower] },
          ],
        },
      },
    },
    { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
    {
      $group: {
        _id: { $toLower: '$whoAddress' },
        whoAddress: { $first: '$whoAddress' },
        event: { $first: '$event' },
        conditionAddress: { $first: { $ifNull: ['$conditionAddress', null] } },
      },
    },
    { $match: { event: IEventLogPermission.Granted } },
  ])) as ActiveExecuteGrant[]

  return new Map(grants.map(grant => [grant.whoAddress.toLowerCase(), grant]))
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
  daoAddresses,
  safeAddresses,
}: SafeBodyRelationParams): Promise<Setting[]> => {
  const body = safeAddresses
    ? { address: { $in: safeAddresses }, brandId: VotingBodyBrandIdentity.SAFE }
    : { address: { $ne: null }, brandId: VotingBodyBrandIdentity.SAFE }
  const settings = await Models.Setting.find({
    network,
    status: ISettingStatus.active,
    ...(daoAddresses ? { daoAddress: { $in: daoAddresses } } : daoAddress ? { daoAddress } : {}),
    stages: { $elemMatch: { plugins: { $elemMatch: body } } },
  }).sort({ blockNumber: -1 })
  if (!settings.length) return []

  const settingPairs = settings.flatMap(setting => {
    const pluginAddress = canonicalStoredAddress(setting.pluginAddress, network, 'SPP')
    const daoAddress = canonicalStoredAddress(setting.daoAddress, network, 'DAO')
    return pluginAddress && daoAddress ? [{ pluginAddress, daoAddress }] : []
  })
  if (!settingPairs.length) return []
  const installedSppPlugins = await Models.Plugin.find({
    network,
    status: IPluginStatus.installed,
    interfaceType: IPluginInterfaceType.spp,
    $or: settingPairs.map(({ pluginAddress, daoAddress }) => ({
      address: { $in: addressVariants(pluginAddress) },
      daoAddress: { $in: addressVariants(daoAddress) },
    })),
  })
    .select('address daoAddress')
    .lean()
  const installed = new Set(
    installedSppPlugins.flatMap(plugin => {
      const pluginAddress = canonicalStoredAddress(plugin.address, network, 'SPP')
      const daoAddress = canonicalStoredAddress(plugin.daoAddress, network, 'DAO')
      return pluginAddress && daoAddress ? [`${daoAddress}-${pluginAddress}`] : []
    }),
  )
  return settings.filter(setting => {
    const pluginAddress = canonicalStoredAddress(setting.pluginAddress, network, 'SPP')
    const daoAddress = canonicalStoredAddress(setting.daoAddress, network, 'DAO')
    return !!pluginAddress && !!daoAddress && installed.has(`${daoAddress}-${pluginAddress}`)
  })
}

const upsertSafeMember = async (network: NetworksEnum, safeAddress: HexAddress, memberAddress: HexAddress) => {
  const canonicalSafeAddress = canonicalAddress(safeAddress)
  const canonicalMemberAddress = canonicalAddress(memberAddress)
  await BaseGovernance.ensureBaseMember(canonicalMemberAddress)
  try {
    await Models.SafeMember.updateOne(
      { network, safeAddress: canonicalSafeAddress, memberAddress: canonicalMemberAddress },
      {
        $setOnInsert: {
          id: `${network}-${canonicalSafeAddress}-${canonicalMemberAddress}`,
          network,
          safeAddress: canonicalSafeAddress,
          memberAddress: canonicalMemberAddress,
        },
      },
      { upsert: true },
    )
  } catch (error) {
    if (!DbTx.isErrorDuplicateKey(error)) throw error
  }
}

const SafeBodyMembersModule = {
  requestDaoMetrics,

  async getSafeAddresses(daoAddress: HexAddress, network: NetworksEnum): Promise<HexAddress[]> {
    const settings = await findActiveSafeBodySettings({ daoAddress, network })
    const addresses = new Set<HexAddress>()
    for (const setting of settings) {
      for (const stage of setting.stages ?? []) {
        for (const body of stage.plugins ?? []) {
          if (body.address && body.brandId === VotingBodyBrandIdentity.SAFE) addresses.add(body.address)
        }
      }
    }

    const processes = await Models.Plugin.distinct('address', {
      daoAddress,
      network,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
    })
    for (const address of processes) addresses.add(address as HexAddress)
    return [...addresses]
  },

  /**
   * Reconcile the one ordinary Plugin record that represents this Safe/DAO relationship.
   * SPP settings supply body capability; the latest DAO Execute event supplies process capability.
   */
  async reconcileDaoAssociations(
    daoAddress: HexAddress,
    network: NetworksEnum,
    info: ILogInfo,
    options: ReconcileDaoAssociationsOptions = {},
  ): Promise<void> {
    const canonicalDaoAddress = canonicalAddress(daoAddress)
    const daoAddresses = addressVariants(canonicalDaoAddress)
    const settings = await findActiveSafeBodySettings({ daoAddresses, network })
    const settingBySafe = new Map<string, Setting>()
    const safeAddresses = new Map<string, HexAddress>()

    for (const setting of settings) {
      for (const stage of setting.stages ?? []) {
        for (const body of stage.plugins ?? []) {
          if (!body.address || body.brandId !== VotingBodyBrandIdentity.SAFE) continue
          const safeAddress = canonicalStoredAddress(body.address, network, 'Safe')
          if (!safeAddress) continue
          const key = safeAddress.toLowerCase()
          safeAddresses.set(key, safeAddress)
          if (!settingBySafe.has(key)) settingBySafe.set(key, setting)
        }
      }
    }

    const existingRows = await Models.Plugin.find({
      daoAddress: { $in: daoAddresses },
      network,
      interfaceType: IPluginInterfaceType.safe,
    })
    const existingBySafe = new Map<string, (typeof existingRows)[number]>()
    for (const plugin of existingRows) {
      const safeAddress = canonicalStoredAddress(plugin.address, network, 'Safe')
      if (!safeAddress) continue
      const key = safeAddress.toLowerCase()
      safeAddresses.set(key, safeAddress)
      existingBySafe.set(key, plugin)
    }

    const executeGrants = await findActiveExecuteGrants(canonicalDaoAddress, [...safeAddresses.values()], network)
    if (options.executeOverride) {
      const safeAddress = canonicalAddress(options.executeOverride.safeAddress)
      const key = safeAddress.toLowerCase()
      safeAddresses.set(key, safeAddress)
      if (options.executeOverride.active) {
        executeGrants.set(key, {
          whoAddress: safeAddress,
          event: IEventLogPermission.Granted,
          conditionAddress: null,
        })
      } else {
        executeGrants.delete(key)
      }
    }

    for (const [key, safeAddress] of safeAddresses) {
      const setting = settingBySafe.get(key)
      const existing = existingBySafe.get(key)
      const executeGrant = executeGrants.get(key)
      const isSppBody = !!setting
      const isProcess = !!executeGrant

      // Execute-only rows are created by the grant handler, which first verifies the address on-chain.
      if (!existing && !isSppBody) continue

      if (isSppBody || isProcess) {
        const conditionAddress = executeGrant?.conditionAddress ?? null
        const conditionInterfaceType =
          existing?.conditionAddress === conditionAddress ? existing.conditionInterfaceType : null
        const update = {
          address: safeAddress,
          daoAddress: canonicalDaoAddress,
          interfaceType: IPluginInterfaceType.safe,
          status: IPluginStatus.installed,
          isSupported: true,
          isBody: true,
          isProcess,
          isSubPlugin: false,
          conditionAddress,
          conditionInterfaceType,
          uninstalled: { status: false },
        }
        let plugin = existing

        if (existing) {
          const needsUpdate =
            existing.address !== safeAddress ||
            existing.daoAddress !== canonicalDaoAddress ||
            existing.status !== IPluginStatus.installed ||
            existing.isSupported !== true ||
            existing.isBody !== true ||
            existing.isProcess !== isProcess ||
            existing.isSubPlugin !== false ||
            existing.conditionAddress !== conditionAddress ||
            existing.conditionInterfaceType !== conditionInterfaceType ||
            existing.uninstalled?.status !== false
          if (needsUpdate) {
            plugin = await DbOperations.updateDocument(
              existing,
              update,
              { logId: existing.id, info },
              'Reconcile Safe association',
              llo,
            )
          }
        } else {
          const transactionHash = setting!.transactionHash || info.transactionHash
          plugin = await DbOperations.createDocument(
            Models.Plugin,
            {
              id: `${network}-${transactionHash}-${safeAddress}-${canonicalDaoAddress}`,
              transactionHash,
              blockNumber: setting!.blockNumber ?? info.blockNumber,
              blockTimestamp: setting!.blockTimestamp,
              network,
              ...update,
            },
            info,
            'New Safe body association',
            llo,
          )
          if (!plugin) {
            plugin = await Models.Plugin.findOne({
              network,
              daoAddress: canonicalDaoAddress,
              address: safeAddress,
              interfaceType: IPluginInterfaceType.safe,
            })
          }
        }

        if (plugin) await PluginSlug.generateSlug(plugin)
        continue
      }

      if (
        existing &&
        (existing.status !== IPluginStatus.uninstalled ||
          existing.isBody !== false ||
          existing.isProcess !== false ||
          existing.conditionAddress ||
          existing.conditionInterfaceType)
      ) {
        const plugin = await DbOperations.updateDocument(
          existing,
          {
            status: IPluginStatus.uninstalled,
            isBody: false,
            isProcess: false,
            conditionAddress: null,
            conditionInterfaceType: null,
            uninstalled: {
              status: true,
              transactionHash: info.transactionHash,
              blockNumber: info.blockNumber,
            },
          },
          { logId: existing.id, info },
          'Remove inactive Safe association',
          llo,
        )
        if (plugin) await PluginSlug.deleteSlug(plugin)
      }
    }
  },

  async findDaosWithSafeBody(
    safeAddresses: HexAddress[],
    network: NetworksEnum,
  ): Promise<Array<{ daoAddress: HexAddress; network: NetworksEnum }>> {
    if (!safeAddresses.length) return []
    const settings = await findActiveSafeBodySettings({ safeAddresses, network })
    const daos = new Map<string, { daoAddress: HexAddress; network: NetworksEnum }>()
    for (const setting of settings) {
      if (setting.daoAddress) daos.set(`${network}-${setting.daoAddress}`, { daoAddress: setting.daoAddress, network })
    }
    const processes = await Models.Plugin.find({
      address: { $in: safeAddresses },
      network,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
    })
      .select('daoAddress')
      .lean()
    for (const { daoAddress } of processes) {
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

  /**
   * Owner snapshot reconciliation for a partial index. Unlike seedDao, this bypasses the zero-row
   * gate: it reads current owners for every visible Safe even when some rows already exist and
   * upserts the missing tuples. Addition-only, so a stale owner is left for the event path; a bad
   * Safe or owner address is logged per-Safe and never aborts the other Safes. The manual replay in
   * `tools/registerSafeProcesses` calls this to repair an owner index an earlier partial seed left.
   */
  async reconcileOwners(daoAddress: HexAddress, network: NetworksEnum): Promise<void> {
    try {
      const safeAddresses = await SafeBodyMembersModule.getSafeAddresses(daoAddress, network)
      const seenSafeAddresses = new Set<HexAddress>()
      for (const safeAddress of safeAddresses) {
        try {
          const canonicalSafe = getAddress(safeAddress) as HexAddress
          if (seenSafeAddresses.has(canonicalSafe)) continue
          seenSafeAddresses.add(canonicalSafe)
          const owners = await SafeChainReaderModule.readOwners(network, canonicalSafe)
          if (!owners) continue
          const uniqueOwners = new Set<HexAddress>()
          for (const owner of owners) {
            let canonicalOwner: HexAddress
            try {
              canonicalOwner = getAddress(owner) as HexAddress
            } catch (error) {
              logger.warn(
                'Unable to normalize Safe owner during reconciliation',
                llo({ daoAddress, network, safeAddress, owner, error }),
              )
              continue
            }
            if (uniqueOwners.has(canonicalOwner)) continue
            uniqueOwners.add(canonicalOwner)
            try {
              await upsertSafeMember(network, canonicalSafe, canonicalOwner)
            } catch (error) {
              logger.warn(
                'Unable to reconcile Safe owner',
                llo({ daoAddress, network, safeAddress: canonicalSafe, owner: canonicalOwner, error }),
              )
            }
          }
        } catch (error) {
          logger.warn('Unable to reconcile Safe body owners', llo({ daoAddress, network, safeAddress, error }))
        }
      }
    } catch (error) {
      logger.warn('Unable to discover Safe bodies for reconciliation', llo({ daoAddress, network, error }))
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
        if (!(await Models.SafeMember.exists({ network, safeAddress: normalizedSafe }))) return 0
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

    if (relationDiscoverySucceeded && !daos.length) {
      try {
        if (!(await Models.SafeMember.exists({ network, safeAddress: normalizedSafe }))) return 0
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
