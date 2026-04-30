import { Models } from '@dbModels'
import logger from '@logger'
import type { HexAddress, IMigration, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillPluginMetricsFirstActivity' })

const BATCH_SIZE = 1000
const PROGRESS_LOG_EVERY = 25_000

type AffectedDoc = {
  _id: any
  memberAddress: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
  lastActivity: number
}

const tripleKey = (a: string, b: string, c: string) => `${a}|${b}|${c}`

const buildMinBlockMap = async (
  model: any,
  fields: { keyA: string; keyB: string; keyC: string },
  label: string,
): Promise<Map<string, number>> => {
  const start = Date.now()
  const cursor = model.aggregate(
    [
      {
        $group: {
          _id: { a: `$${fields.keyA}`, b: `$${fields.keyB}`, c: `$${fields.keyC}` },
          minBlock: { $min: '$blockNumber' },
        },
      },
    ],
    { allowDiskUse: true },
  )
  const map = new Map<string, number>()
  for await (const row of cursor as AsyncIterable<{
    _id: { a?: string | null; b?: string | null; c?: string | null }
    minBlock?: number | null
  }>) {
    const a = row._id?.a
    const b = row._id?.b
    const c = row._id?.c
    if (a == null || b == null || c == null) continue
    if (typeof row.minBlock !== 'number') continue
    map.set(tripleKey(a, b, c), row.minBlock)
  }
  logger.info('Built min-block map', llo({ label, entries: map.size, ms: Date.now() - start }))
  return map
}

export const backfillPluginMetricsFirstActivityMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260430120159-backfillPluginMetricsFirstActivity' }))

    try {
      const filter = {
        lastActivity: { $ne: null },
        $or: [{ firstActivity: null }, { firstActivity: { $exists: false } }],
      }

      const total = await Models.PluginMetrics.countDocuments(filter)
      logger.info('Affected pluginMetrics docs', llo({ total }))
      if (total === 0) return

      const [voteMap, proposalMap, delegatorMap, toDelegateMap] = await Promise.all([
        buildMinBlockMap(Models.Vote, { keyA: 'memberAddress', keyB: 'pluginAddress', keyC: 'network' }, 'Vote'),
        buildMinBlockMap(
          Models.Proposal,
          { keyA: 'creatorAddress', keyB: 'pluginAddress', keyC: 'network' },
          'Proposal',
        ),
        buildMinBlockMap(
          Models.LogDelegateChanged,
          { keyA: 'delegator', keyB: 'tokenAddress', keyC: 'network' },
          'LogDelegateChanged.delegator',
        ),
        buildMinBlockMap(
          Models.LogDelegateChanged,
          { keyA: 'toDelegate', keyB: 'tokenAddress', keyC: 'network' },
          'LogDelegateChanged.toDelegate',
        ),
      ])

      const distinctPlugins = (await Models.PluginMetrics.distinct('pluginAddress', filter)) as HexAddress[]
      const pluginDocs = (await Models.Plugin.find(
        { address: { $in: distinctPlugins } },
        { address: 1, network: 1, tokenAddress: 1 },
      ).lean()) as Array<{ address: HexAddress; network: NetworksEnum; tokenAddress?: HexAddress }>
      const pluginTokenMap = new Map<string, HexAddress | null>()
      for (const p of pluginDocs) {
        pluginTokenMap.set(`${p.network}-${p.address}`, p.tokenAddress ?? null)
      }
      logger.info('Built plugin->token map', llo({ entries: pluginTokenMap.size }))

      const cursor = Models.PluginMetrics.find(filter, {
        _id: 1,
        memberAddress: 1,
        pluginAddress: 1,
        network: 1,
        lastActivity: 1,
      })
        .lean()
        .cursor() as AsyncIterable<AffectedDoc>

      let ops: any[] = []
      let processed = 0
      let updated = 0
      for await (const doc of cursor) {
        const tokenAddress = pluginTokenMap.get(`${doc.network}-${doc.pluginAddress}`) ?? null

        const candidates: number[] = [doc.lastActivity]
        const voteMin = voteMap.get(tripleKey(doc.memberAddress, doc.pluginAddress, doc.network))
        if (voteMin !== undefined) candidates.push(voteMin)
        const proposalMin = proposalMap.get(tripleKey(doc.memberAddress, doc.pluginAddress, doc.network))
        if (proposalMin !== undefined) candidates.push(proposalMin)
        if (tokenAddress) {
          const delegatorMin = delegatorMap.get(tripleKey(doc.memberAddress, tokenAddress, doc.network))
          if (delegatorMin !== undefined) candidates.push(delegatorMin)
          const toDelegateMin = toDelegateMap.get(tripleKey(doc.memberAddress, tokenAddress, doc.network))
          if (toDelegateMin !== undefined) candidates.push(toDelegateMin)
        }

        const firstActivity = Math.min(...candidates)
        ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { firstActivity } } } })

        if (ops.length >= BATCH_SIZE) {
          const result = await Models.PluginMetrics.bulkWrite(ops, { ordered: false })
          updated += result.modifiedCount ?? 0
          ops = []
        }

        processed++
        if (processed % PROGRESS_LOG_EVERY === 0) {
          logger.info('Backfill progress', llo({ processed, total, updated }))
        }
      }

      if (ops.length) {
        const result = await Models.PluginMetrics.bulkWrite(ops, { ordered: false })
        updated += result.modifiedCount ?? 0
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260430120159-backfillPluginMetricsFirstActivity', processed, updated }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260430120159-backfillPluginMetricsFirstActivity', error }))
      throw error
    }
  },

  stop: async () => {},
}

export default backfillPluginMetricsFirstActivityMigration
