import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { SAFE_PLUGIN_ASSOCIATION_INDEX_NAME } from '@models/schema/plugin'
import { IPluginInterfaceType, IPluginSlug, type IMigration } from '@types'
import { getAddress } from 'ethers'

const MIGRATION = '20261002000000-uniqueSafePluginAssociations'
const MAX_ATTEMPTS = 2
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

type PluginRow = {
  _id: unknown
  network: string
  address: string
  daoAddress: string
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
  network: string
  canonicalAddress: string
  canonicalDaoAddress: string
  rows: CanonicalPluginRow[]
  keeper: CanonicalPluginRow
}

type PluginSlugRow = SortableRow & {
  network: string
  daoAddress: string
  pluginAddress: string
  slug?: string
}

const exactTupleKey = (network: string, daoAddress: string, address: string) =>
  JSON.stringify([network, daoAddress, address])

const canonicalTupleKey = (network: string, daoAddress: string, address: string) =>
  exactTupleKey(network, daoAddress.toLowerCase(), address.toLowerCase())

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
    const canonicalAddress = getAddress(row.address)
    const canonicalDaoAddress = getAddress(row.daoAddress)
    const associationKey = canonicalTupleKey(row.network, canonicalDaoAddress, canonicalAddress)
    const canonicalRow: CanonicalPluginRow = {
      ...row,
      rawAddress: row.address,
      rawDaoAddress: row.daoAddress,
      canonicalAddress,
      canonicalDaoAddress,
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

const slugKey = (network: string, daoAddress: string, slug: string) => JSON.stringify([network, daoAddress, slug])

const reconcileSlugs = async (groups: PluginGroup[]) => {
  if (!groups.length) return

  const slugRows = (await Models.PluginSlug.collection.find({}).toArray()) as unknown as PluginSlugRow[]
  const groupByAssociationKey = new Map(groups.map(group => [group.associationKey, group]))
  const slugsByGroup = new Map<string, PluginSlugRow[]>()
  for (const slug of slugRows) {
    const group = groupByAssociationKey.get(canonicalTupleKey(slug.network, slug.daoAddress, slug.pluginAddress))
    if (!group) continue
    const current = slugsByGroup.get(group.associationKey)
    if (current) current.push(slug)
    else slugsByGroup.set(group.associationKey, [slug])
  }

  const heldSlugKeys = new Set(slugRows.map(slug => slugKey(slug.network, slug.daoAddress, slug.slug ?? '')))
  const plans: Array<{
    group: PluginGroup
    keeper: PluginSlugRow
    temporaryKey: string
    baseSlug: string
  }> = []
  const migrationSlugPrefix = '__safe_association_migration__'
  const orderedGroups = [...groups].sort((left, right) => left.associationKey.localeCompare(right.associationKey))

  // Stage each keeper under a unique temporary slug before canonicalizing keys. This prevents a
  // keeper from colliding with a case-variant key still held by a group processed later.
  for (const group of orderedGroups) {
    const dependentSlugs = slugsByGroup.get(group.associationKey)
    if (!dependentSlugs?.length) continue

    dependentSlugs.sort((left, right) => {
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

    const keeper = dependentSlugs[0]
    const duplicates = dependentSlugs.slice(1)
    if (duplicates.length) {
      await Models.PluginSlug.collection.deleteMany({ _id: { $in: duplicates.map(slug => slug._id) } })
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
}

const cleanup = async () => {
  const groups = await loadSafeGroups()
  const duplicateIds = groups.flatMap(group => group.rows.slice(1).map(row => row._id))

  if (duplicateIds.length) await Models.Plugin.deleteMany({ _id: { $in: duplicateIds } })

  for (const group of groups) {
    await Models.Plugin.collection.updateOne(
      { _id: group.keeper._id },
      {
        $set: {
          address: group.canonicalAddress,
          daoAddress: group.canonicalDaoAddress,
        },
      },
    )
  }

  await reconcileSlugs(groups)
  return { groups: groups.length, deleted: duplicateIds.length }
}

export const uniqueSafePluginAssociationsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION, index: SAFE_PLUGIN_ASSOCIATION_INDEX_NAME }))

    try {
      let cleanupResult = { groups: 0, deleted: 0 }
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        cleanupResult = await cleanup()
        try {
          await Models.Plugin.syncIndexes()
          break
        } catch (error) {
          if (!DbTx.isErrorDuplicateKey(error) || attempt === MAX_ATTEMPTS) throw error
          logger.warn('Unique Safe association index rejected a duplicate written during its build', llo({ attempt }))
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
