import { Models } from '@dbModels'
import logger from '@logger'
import type { IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: fixProposalSettingsMinProposerVotingPowerType' })

const WRITE_BATCH_SIZE = 1000
const SETTING_LOOKUP_CHUNK = 5000
const PROGRESS_LOG_EVERY = 25_000

type AffectedDoc = {
  _id: any
  settings?: {
    id?: string
    minProposerVotingPower?: unknown
  }
}

const filter = {
  'settings.minProposerVotingPower': { $type: ['double', 'int', 'long', 'decimal'] as any },
}

const buildSettingMap = async (settingIds: string[]): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  for (let i = 0; i < settingIds.length; i += SETTING_LOOKUP_CHUNK) {
    const chunk = settingIds.slice(i, i + SETTING_LOOKUP_CHUNK)
    const cursor = Models.Setting.collection.find(
      { id: { $in: chunk }, minProposerVotingPower: { $type: 'string' } },
      { projection: { id: 1, minProposerVotingPower: 1 } },
    )
    for await (const row of cursor as AsyncIterable<{ id: string; minProposerVotingPower: string }>) {
      map.set(row.id, row.minProposerVotingPower)
    }
  }
  return map
}

export const fixProposalSettingsMinProposerVotingPowerTypeMigration: IMigration = {
  start: async () => {
    logger.info(
      'Starting migration',
      llo({ migration: '20260501100801-fixProposalSettingsMinProposerVotingPowerType' }),
    )

    try {
      const total = await Models.Proposal.countDocuments(filter)
      logger.info('Affected proposal docs', llo({ total }))
      if (total === 0) return

      const settingIds = (await Models.Proposal.distinct('settings.id', filter)) as Array<string | null>
      const validSettingIds = settingIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      logger.info('Distinct setting ids to look up', llo({ count: validSettingIds.length }))

      const settingMap = await buildSettingMap(validSettingIds)
      logger.info('Built setting map', llo({ entries: settingMap.size }))

      const cursor = Models.Proposal.find(filter, {
        _id: 1,
        'settings.id': 1,
        'settings.minProposerVotingPower': 1,
      })
        .lean()
        .cursor() as AsyncIterable<AffectedDoc>

      let ops: any[] = []
      let processed = 0
      let updated = 0
      let recoveredFromSetting = 0
      let fallbackStringified = 0

      for await (const doc of cursor) {
        const settingId = doc.settings?.id
        const lossy = doc.settings?.minProposerVotingPower

        let value: string | undefined
        if (settingId && settingMap.has(settingId)) {
          value = settingMap.get(settingId)!
          recoveredFromSetting++
        } else if (lossy !== undefined && lossy !== null) {
          const stringified = typeof lossy === 'number' ? BigInt(Math.trunc(lossy)).toString() : String(lossy)
          if (stringified.length > 0 && stringified !== 'NaN' && stringified !== 'Infinity') {
            value = stringified
            fallbackStringified++
          }
        }

        if (value === undefined) continue

        ops.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { 'settings.minProposerVotingPower': value } },
          },
        })

        if (ops.length >= WRITE_BATCH_SIZE) {
          const result = await Models.Proposal.bulkWrite(ops, { ordered: false })
          updated += result.modifiedCount ?? 0
          ops = []
        }

        processed++
        if (processed % PROGRESS_LOG_EVERY === 0) {
          logger.info(
            'Backfill progress',
            llo({ processed, total, updated, recoveredFromSetting, fallbackStringified }),
          )
        }
      }

      if (ops.length) {
        const result = await Models.Proposal.bulkWrite(ops, { ordered: false })
        updated += result.modifiedCount ?? 0
      }

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20260501100801-fixProposalSettingsMinProposerVotingPowerType',
          processed,
          updated,
          recoveredFromSetting,
          fallbackStringified,
        }),
      )
    } catch (error) {
      logger.error(
        'Migration failed',
        llo({ migration: '20260501100801-fixProposalSettingsMinProposerVotingPowerType', error }),
      )
      throw error
    }
  },

  stop: async () => {},
}

export default fixProposalSettingsMinProposerVotingPowerTypeMigration
