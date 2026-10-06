import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { SAFE_PLUGIN_ASSOCIATION_INDEX_NAME } from '@models/schema/plugin'
import { IPluginInterfaceType, IPluginSlug, type IMigration, type NetworksEnum } from '@types'
import { getAddress } from 'ethers'

const MIGRATION = '20261002000000-uniqueSafePluginAssociations'
const MAX_ATTEMPTS = 2
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

type PluginRow = {
  _id: unknown
  network: NetworksEnum
  address: string
  daoAddress: string
  transactionHash: string
  blockNumber?: number
  updatedAt?: Date | string
}

type SortableRow = {
  _id: unknown
  updatedAt?: Date | string
  blockNumber?: number
}

type CanonicalPluginRow = PluginRow & {
  rawAddress: string
  rawDaoAddress: string
  canonicalAddress: string
  canonicalDaoAddress: string
  associationKey: string
}

type PluginGroup = {
  associationKey: string
  network: NetworksEnum
  canonicalAddress: string
  canonicalDaoAddress: string
  rows: CanonicalPluginRow[]
  keeper: CanonicalPluginRow
}

type PluginSlugRow = SortableRow & {
  network: NetworksEnum
  daoAddress: string
  pluginAddress: string
  slug?: string
}

type ConfigIndexerRow = SortableRow & {
  id: string
  network: NetworksEnum
  service: string
  lastSync?: number
  end?: boolean
}

type SafeMemberRow = SortableRow & {
  id: string
  network: NetworksEnum
  safeAddress: string
  memberAddress: string
}

const exactTupleKey = (network: string, daoAddress: string, address: string) =>
  JSON.stringify([network, daoAddress, address])

const canonicalTupleKey = (network: string, daoAddress: string, address: string) =>
  exactTupleKey(network, daoAddress.toLowerCase(), address.toLowerCase())

const canonicalAddress = (value: unknown, collection: string, id: unknown, field: string) => {
  if (typeof value !== 'string') {
    throw new Error(`${MIGRATION}: invalid ${collection}.${field} for ${String(id)}: ${String(value)}`)
  }
  try {
    return getAddress(value)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${MIGRATION}: invalid ${collection}.${field} for ${String(id)}: ${value}; ${reason}`)
  }
}

const timestamp = (value: Date | string | undefined) => {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

const compareNewest = (left: SortableRow, right: SortableRow) => {
  const leftUpdatedAt = timestamp(left.updatedAt)
  const rightUpdatedAt = timestamp(right.updatedAt)
  if (leftUpdatedAt !== rightUpdatedAt) return rightUpdatedAt - leftUpdatedAt

  const leftBlockNumber = left.blockNumber ?? Number.NEGATIVE_INFINITY
  const rightBlockNumber = right.blockNumber ?? Number.NEGATIVE_INFINITY
  if (leftBlockNumber !== rightBlockNumber) return rightBlockNumber - leftBlockNumber

  return String(right._id).localeCompare(String(left._id))
}

const loadSafeGroups = async (): Promise<PluginGroup[]> => {
  const rows = (await Models.Plugin.find({ interfaceType: IPluginInterfaceType.safe })
    .lean()
    .exec()) as unknown as PluginRow[]
  const groups = new Map<string, CanonicalPluginRow[]>()

  // Validate every persisted Safe address before any cleanup or index enforcement.
  for (const row of rows) {
    const normalizedAddress = canonicalAddress(row.address, 'Plugin', row._id, 'address')
    const normalizedDaoAddress = canonicalAddress(row.daoAddress, 'Plugin', row._id, 'daoAddress')
    if (typeof row.transactionHash !== 'string' || !row.transactionHash) {
      throw new Error(
        `${MIGRATION}: invalid Plugin.transactionHash for ${String(row._id)}: ${String(row.transactionHash)}`,
      )
    }
    const associationKey = canonicalTupleKey(row.network, normalizedDaoAddress, normalizedAddress)
    const canonicalRow: CanonicalPluginRow = {
      ...row,
      rawAddress: row.address,
      rawDaoAddress: row.daoAddress,
      canonicalAddress: normalizedAddress,
      canonicalDaoAddress: normalizedDaoAddress,
      associationKey,
    }
    const group = groups.get(associationKey)
    if (group) group.push(canonicalRow)
    else groups.set(associationKey, [canonicalRow])
  }

  return [...groups.entries()].map(([associationKey, groupRows]) => {
    const sortedRows = groupRows.sort(compareNewest)
    const keeper = sortedRows[0]
    return {
      associationKey,
      network: keeper.network,
      canonicalAddress: keeper.canonicalAddress,
      canonicalDaoAddress: keeper.canonicalDaoAddress,
      rows: sortedRows,
      keeper,
    }
  })
}

const validateSafeMembers = async () => {
  const cursor = Models.SafeMember.collection.find({}, { projection: { _id: 1, safeAddress: 1, memberAddress: 1 } })
  for await (const row of cursor) {
    canonicalAddress(row.safeAddress, 'SafeMember', row._id, 'safeAddress')
    canonicalAddress(row.memberAddress, 'SafeMember', row._id, 'memberAddress')
  }
}

const slugKey = (network: string, daoAddress: string, slug: string) => JSON.stringify([network, daoAddress, slug])

const reconcileSlugs = async (groups: PluginGroup[]) => {
  if (!groups.length) return { deleted: 0, rewritten: 0 }

  const groupsByNetwork = new Map<NetworksEnum, PluginGroup[]>()
  for (const group of groups) {
    const networkGroups = groupsByNetwork.get(group.network)
    if (networkGroups) networkGroups.push(group)
    else groupsByNetwork.set(group.network, [group])
  }
  const dependentFilters = [...groupsByNetwork.entries()].map(([network, networkGroups]) => ({
    network,
    pluginAddress: {
      $in: [
        ...new Set(networkGroups.flatMap(group => [group.canonicalAddress, ...group.rows.map(row => row.rawAddress)])),
      ],
    },
  }))
  const occupiedFilters = [...groupsByNetwork.entries()].map(([network, networkGroups]) => ({
    network,
    daoAddress: {
      $in: [
        ...new Set(
          networkGroups.flatMap(group => [group.canonicalDaoAddress, ...group.rows.map(row => row.rawDaoAddress)]),
        ),
      ],
    },
  }))
  const dependentSlugs = (await Models.PluginSlug.collection
    .find({ $or: dependentFilters })
    .toArray()) as unknown as PluginSlugRow[]
  const occupiedSlugs = (await Models.PluginSlug.collection
    .find({ $or: occupiedFilters })
    .toArray()) as unknown as PluginSlugRow[]
  const groupByAssociationKey = new Map(groups.map(group => [group.associationKey, group]))
  const slugsByGroup = new Map<string, PluginSlugRow[]>()
  for (const slug of dependentSlugs) {
    const group = groupByAssociationKey.get(canonicalTupleKey(slug.network, slug.daoAddress, slug.pluginAddress))
    if (!group) continue
    const current = slugsByGroup.get(group.associationKey)
    if (current) current.push(slug)
    else slugsByGroup.set(group.associationKey, [slug])
  }

  const heldSlugKeys = new Set(occupiedSlugs.map(slug => slugKey(slug.network, slug.daoAddress, slug.slug ?? '')))
  const plans: Array<{
    group: PluginGroup
    keeper: PluginSlugRow
    temporaryKey: string
    baseSlug: string
  }> = []
  const migrationSlugPrefix = '__safe_association_migration__'
  const orderedGroups = [...groups].sort((left, right) => left.associationKey.localeCompare(right.associationKey))
  let deleted = 0

  // Stage each keeper under a unique temporary slug before canonicalizing keys. This prevents a
  // keeper from colliding with a case-variant key still held by a group processed later.
  for (const group of orderedGroups) {
    const groupSlugs = slugsByGroup.get(group.associationKey)
    if (!groupSlugs?.length) continue

    groupSlugs.sort((left, right) => {
      const leftBelongsToKeeper =
        left.network === group.keeper.network &&
        left.daoAddress === group.keeper.rawDaoAddress &&
        left.pluginAddress === group.keeper.rawAddress
      const rightBelongsToKeeper =
        right.network === group.keeper.network &&
        right.daoAddress === group.keeper.rawDaoAddress &&
        right.pluginAddress === group.keeper.rawAddress
      if (leftBelongsToKeeper !== rightBelongsToKeeper) return leftBelongsToKeeper ? -1 : 1
      return compareNewest(left, right)
    })

    const keeper = groupSlugs[0]
    const duplicates = groupSlugs.slice(1)
    if (duplicates.length) {
      await Models.PluginSlug.collection.deleteMany({ _id: { $in: duplicates.map(slug => slug._id) } })
      deleted += duplicates.length
      for (const duplicate of duplicates) {
        heldSlugKeys.delete(slugKey(duplicate.network, duplicate.daoAddress, duplicate.slug ?? ''))
      }
    }

    heldSlugKeys.delete(slugKey(keeper.network, keeper.daoAddress, keeper.slug ?? ''))
    const temporaryBase = `${migrationSlugPrefix}${String(keeper._id)}`
    let temporarySlug = temporaryBase
    let temporarySuffix = 0
    while (heldSlugKeys.has(slugKey(keeper.network, keeper.daoAddress, temporarySlug))) {
      temporarySuffix += 1
      temporarySlug = `${temporaryBase}_${temporarySuffix}`
    }
    await Models.PluginSlug.collection.updateOne({ _id: keeper._id }, { $set: { slug: temporarySlug } })
    const temporaryKey = slugKey(keeper.network, keeper.daoAddress, temporarySlug)
    heldSlugKeys.add(temporaryKey)
    plans.push({
      group,
      keeper,
      temporaryKey,
      baseSlug: keeper.slug && !keeper.slug.startsWith(migrationSlugPrefix) ? keeper.slug : IPluginSlug.safe,
    })
  }

  for (const { group, keeper, temporaryKey, baseSlug } of plans) {
    heldSlugKeys.delete(temporaryKey)
    let slug = baseSlug
    let suffix = 0
    while (heldSlugKeys.has(slugKey(group.network, group.canonicalDaoAddress, slug))) {
      suffix += 1
      slug = `${baseSlug}_${suffix}`
    }

    await Models.PluginSlug.collection.updateOne(
      { _id: keeper._id },
      {
        $set: {
          network: group.network,
          daoAddress: group.canonicalDaoAddress,
          pluginAddress: group.canonicalAddress,
          slug,
        },
      },
    )
    heldSlugKeys.add(slugKey(group.network, group.canonicalDaoAddress, slug))
  }

  return { deleted, rewritten: plans.length }
}

const reconcilePermissionCursors = async (groups: PluginGroup[]) => {
  if (!groups.length) return { deleted: 0, rewritten: 0 }

  const groupByAssociationKey = new Map(groups.map(group => [group.associationKey, group]))
  const networks = [...new Set(groups.map(group => group.network))]
  const cursor = Models.ConfigIndexer.collection.find({
    $or: networks.map(network => ({ network, service: { $regex: `^permission-${network}-` } })),
  })
  const cursorsByTarget = new Map<string, { service: string; rows: ConfigIndexerRow[] }>()
  for await (const rawRow of cursor) {
    const row = rawRow as unknown as ConfigIndexerRow
    const prefix = `permission-${row.network}-`
    if (typeof row.service !== 'string' || !row.service.startsWith(prefix)) continue
    const suffix = row.service.slice(prefix.length)
    if (suffix.length < 86 || suffix[42] !== '-' || suffix[85] !== '-') continue
    const safeAddress = suffix.slice(0, 42)
    const daoAddress = suffix.slice(43, 85)
    const conditionAddress = suffix.slice(86)
    const group = groupByAssociationKey.get(canonicalTupleKey(row.network, daoAddress, safeAddress))
    if (!group) continue

    const service = ConfigIndexerHelper.builders.permission(
      group.network,
      `${group.canonicalAddress}-${group.canonicalDaoAddress}-${conditionAddress}`,
    )
    const id = Models.ConfigIndexer.getEntityId({ network: group.network, service })
    const current = cursorsByTarget.get(id)
    if (current) current.rows.push(row)
    else cursorsByTarget.set(id, { service, rows: [row] })
  }

  let deleted = 0
  let rewritten = 0
  for (const [id, { service, rows }] of cursorsByTarget) {
    rows.sort((left, right) => {
      const leftCanonical = left.id === id
      const rightCanonical = right.id === id
      if (leftCanonical !== rightCanonical) return leftCanonical ? -1 : 1
      return compareNewest(left, right)
    })
    const keeper = rows[0]
    const duplicates = rows.slice(1)
    if (duplicates.length) {
      await Models.ConfigIndexer.collection.deleteMany({ _id: { $in: duplicates.map(row => row._id) } })
      deleted += duplicates.length
    }
    await Models.ConfigIndexer.collection.updateOne(
      { _id: keeper._id },
      {
        $set: {
          id,
          network: keeper.network,
          service,
          lastSync: Math.max(...rows.map(row => row.lastSync ?? 0)),
          end: rows.some(row => row.end === true),
        },
      },
    )
    rewritten++
  }

  return { deleted, rewritten }
}

const reconcileSafeMembers = async () => {
  const cursor: AsyncIterable<{ rows: SafeMemberRow[] }> = Models.SafeMember.collection.aggregate(
    [
      {
        $group: {
          _id: {
            network: '$network',
            safeAddress: { $toLower: '$safeAddress' },
            memberAddress: { $toLower: '$memberAddress' },
          },
          rows: {
            $push: {
              _id: '$_id',
              id: '$id',
              network: '$network',
              safeAddress: '$safeAddress',
              memberAddress: '$memberAddress',
              updatedAt: '$updatedAt',
            },
          },
        },
      },
    ],
    { allowDiskUse: true },
  )

  let groups = 0
  let deleted = 0
  for await (const group of cursor) {
    const rows = group.rows.sort(compareNewest)
    const keeper = rows[0]
    const duplicates = rows.slice(1)
    if (duplicates.length) {
      await Models.SafeMember.collection.deleteMany({ _id: { $in: duplicates.map(row => row._id) } })
      deleted += duplicates.length
    }
    const safeAddress = canonicalAddress(keeper.safeAddress, 'SafeMember', keeper._id, 'safeAddress')
    const memberAddress = canonicalAddress(keeper.memberAddress, 'SafeMember', keeper._id, 'memberAddress')
    const id = Models.SafeMember.getEntityId({ network: keeper.network, safeAddress, memberAddress })
    if (keeper.id !== id || keeper.safeAddress !== safeAddress || keeper.memberAddress !== memberAddress) {
      await Models.SafeMember.collection.updateOne({ _id: keeper._id }, { $set: { id, safeAddress, memberAddress } })
    }
    groups++
  }

  return { groups, deleted }
}

const cleanup = async () => {
  const groups = await loadSafeGroups()
  await validateSafeMembers()
  const duplicateIds = groups.flatMap(group => group.rows.slice(1).map(row => row._id))

  if (duplicateIds.length) await Models.Plugin.deleteMany({ _id: { $in: duplicateIds } })

  for (const group of groups) {
    await Models.Plugin.collection.updateOne(
      { _id: group.keeper._id },
      {
        $set: {
          id: `${group.network}-${group.keeper.transactionHash}-${group.canonicalAddress}-${group.canonicalDaoAddress}`,
          address: group.canonicalAddress,
          daoAddress: group.canonicalDaoAddress,
        },
      },
    )
  }

  const slugs = await reconcileSlugs(groups)
  const permissionCursors = await reconcilePermissionCursors(groups)
  const safeMembers = await reconcileSafeMembers()
  return {
    groups: groups.length,
    deleted: duplicateIds.length,
    slugs,
    permissionCursors,
    safeMembers,
  }
}

export const uniqueSafePluginAssociationsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION, index: SAFE_PLUGIN_ASSOCIATION_INDEX_NAME }))

    try {
      let cleanupResult = {
        groups: 0,
        deleted: 0,
        slugs: { deleted: 0, rewritten: 0 },
        permissionCursors: { deleted: 0, rewritten: 0 },
        safeMembers: { groups: 0, deleted: 0 },
      }
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        cleanupResult = await cleanup()
        try {
          await Models.SafeMember.syncIndexes()
          await Models.Plugin.syncIndexes()
          break
        } catch (error) {
          if (!DbTx.isErrorDuplicateKey(error) || attempt === MAX_ATTEMPTS) throw error
          logger.warn('Canonical Safe index rejected a duplicate written during its build', llo({ attempt }))
        }
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION, ...cleanupResult }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default uniqueSafePluginAssociationsMigration
