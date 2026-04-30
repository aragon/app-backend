import { Models } from '@dbModels'
import logger from '@logger'
import type { HexAddress, IMigration, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillPluginMetricsFirstActivity' })

const BATCH_SIZE = 1000
const PROGRESS_LOG_EVERY = 5000

type AffectedDoc = {
  _id: any
  memberAddress: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
  lastActivity: number
}

const findEarliestBlock = async (doc: AffectedDoc, tokenAddress: HexAddress | null): Promise<number> => {
  const memberKey = { memberAddress: doc.memberAddress, pluginAddress: doc.pluginAddress, network: doc.network }
  const proposalKey = { creatorAddress: doc.memberAddress, pluginAddress: doc.pluginAddress, network: doc.network }
  const logKey = tokenAddress
    ? {
        $or: [{ delegator: doc.memberAddress }, { toDelegate: doc.memberAddress }],
        tokenAddress,
        network: doc.network,
      }
    : null

  const [voteMin, proposalMin, logMin] = (await Promise.all([
    Models.Vote.findOne(memberKey, { blockNumber: 1 }).sort({ blockNumber: 1 }).lean(),
    Models.Proposal.findOne(proposalKey, { blockNumber: 1 }).sort({ blockNumber: 1 }).lean(),
    logKey ? Models.LogDelegateChanged.findOne(logKey, { blockNumber: 1 }).sort({ blockNumber: 1 }).lean() : null,
  ])) as Array<{ blockNumber?: number } | null>

  const candidates = [voteMin?.blockNumber, proposalMin?.blockNumber, logMin?.blockNumber, doc.lastActivity].filter(
    (n): n is number => typeof n === 'number',
  )
  return Math.min(...candidates)
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

      const tokenAddressCache = new Map<string, HexAddress | null>()
      const lookupTokenAddress = async (
        pluginAddress: HexAddress,
        network: NetworksEnum,
      ): Promise<HexAddress | null> => {
        const key = `${network}-${pluginAddress}`
        if (tokenAddressCache.has(key)) return tokenAddressCache.get(key)!
        const plugin = (await Models.Plugin.findOne(
          { address: pluginAddress, network },
          { tokenAddress: 1 },
        ).lean()) as { tokenAddress?: HexAddress } | null
        const tokenAddress = plugin?.tokenAddress ?? null
        tokenAddressCache.set(key, tokenAddress)
        return tokenAddress
      }

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
        const tokenAddress = await lookupTokenAddress(doc.pluginAddress, doc.network)
        const firstActivity = await findEarliestBlock(doc, tokenAddress)
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
