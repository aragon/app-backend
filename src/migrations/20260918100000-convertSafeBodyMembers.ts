import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { EnumQueueName, type IMigration, NetworksEnum } from '@types'

const MIGRATION = '20260918100000-convertSafeBodyMembers'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })
const VALID_NETWORKS = Object.values(NetworksEnum)

interface LegacySafeMemberRow {
  _id: unknown
  network?: unknown
  pluginAddress?: unknown
  memberAddress?: unknown
  daoAddress?: unknown
}

const isConvertible = (
  row: LegacySafeMemberRow,
): row is LegacySafeMemberRow & {
  network: NetworksEnum
  pluginAddress: string
  memberAddress: string
} =>
  typeof row.network === 'string' &&
  VALID_NETWORKS.some(network => network === row.network) &&
  typeof row.pluginAddress === 'string' &&
  row.pluginAddress.length > 0 &&
  typeof row.memberAddress === 'string' &&
  row.memberAddress.length > 0
const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000

/**
 * Converts the per-DAO Safe owner rows written by the original Safe-body migration into the
 * globally-owned SafeMember collection. The raw PluginMember collection is intentional: current
 * PluginMember validation no longer knows about the retired `source: safe` discriminator.
 *
 * Each legacy row is removed only after its global tuple has been persisted. Duplicate DAO rows
 * therefore collapse through the tuple upsert, while malformed rows remain available for inspection.
 */
export const convertSafeBodyMembersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    const legacyRows = (await Models.PluginMember.collection
      .find({ source: 'safe' })
      .toArray()) as LegacySafeMemberRow[]
    const daoMetrics = new Map<string, { daoAddress: string; network: NetworksEnum }>()
    let converted = 0
    let skipped = 0

    for (const row of legacyRows) {
      if (!isConvertible(row)) {
        skipped++
        logger.warn('Skipping malformed legacy Safe member row', llo({ migration: MIGRATION, id: row._id }))
        continue
      }

      const { network, pluginAddress: safeAddress, memberAddress } = row
      const id = `${network}-${safeAddress}-${memberAddress}`

      try {
        try {
          const result = await Models.SafeMember.updateOne(
            { network, safeAddress, memberAddress },
            { $setOnInsert: { id, network, safeAddress, memberAddress } },
            { upsert: true },
          )
          if (result.acknowledged === false) throw new Error('SafeMember conversion write was not acknowledged')
        } catch (error) {
          // A concurrent conversion may win the unique tuple race. It is safe to remove this
          // legacy row only after confirming that the destination tuple now exists.
          if (!isDuplicateKeyError(error)) throw error
          const existing = await Models.SafeMember.findOne({ network, safeAddress, memberAddress })
          if (!existing) throw error
          logger.warn(
            'Legacy Safe member conversion hit an existing destination tuple',
            llo({ migration: MIGRATION, id: row._id, network, safeAddress, memberAddress }),
          )
        }

        const result = await Models.PluginMember.collection.deleteOne({ _id: row._id })
        if (result.acknowledged === false) throw new Error('Legacy Safe member delete was not acknowledged')
        if (typeof row.daoAddress === 'string' && row.daoAddress.length > 0) {
          daoMetrics.set(`${network}-${row.daoAddress}`, { daoAddress: row.daoAddress, network })
        }
        converted++
      } catch (error) {
        logger.error(
          'Failed to convert legacy Safe member row',
          llo({ migration: MIGRATION, id: row._id, network, safeAddress, memberAddress, error }),
        )
        throw error
      }
    }

    for (const { daoAddress, network } of daoMetrics.values()) {
      try {
        await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: daoAddress,
          params: { address: daoAddress, network },
        })
      } catch (error) {
        logger.warn(
          'Unable to enqueue DAO metrics refresh after Safe member conversion',
          llo({ daoAddress, network, error }),
        )
      }
    }

    logger.info(
      'Migration completed successfully',
      llo({ migration: MIGRATION, converted, skipped, daoMetrics: daoMetrics.size }),
    )
  },

  stop: async () => {},
}

export default convertSafeBodyMembersMigration
