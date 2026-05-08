import { Models } from '@dbModels'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { type IMigration, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillLockBlockTimestamp' })

const BLOCKS_PER_RPC_BATCH = 100
const WRITE_BATCH_SIZE = 1000

const filter = { $or: [{ blockTimestamp: null }, { blockTimestamp: { $exists: false } }] }

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const buildTimestampMap = async (network: NetworksEnum, blocks: number[]): Promise<Map<number, number>> => {
  const merged = new Map<number, number>()
  for (const batch of chunk(blocks, BLOCKS_PER_RPC_BATCH)) {
    const fetched = await Web3BatchHelper.getBlocksTimestamps(batch, network)
    for (const [bn, ts] of fetched) merged.set(bn, ts)
  }
  return merged
}

const backfillNetwork = async (network: NetworksEnum): Promise<{ updated: number; skipped: number }> => {
  const blocks = (await Models.Lock.distinct('blockNumber', { ...filter, network })) as number[]
  if (blocks.length === 0) return { updated: 0, skipped: 0 }

  const start = Date.now()
  const tsMap = await buildTimestampMap(network, blocks)
  logger.info(
    'Fetched timestamps',
    llo({ network, blocks: blocks.length, resolved: tsMap.size, ms: Date.now() - start }),
  )

  let ops: any[] = []
  let updated = 0
  let skipped = 0
  for (const [blockNumber, blockTimestamp] of tsMap) {
    ops.push({
      updateMany: {
        filter: { ...filter, network, blockNumber },
        update: { $set: { blockTimestamp } },
      },
    })

    if (ops.length >= WRITE_BATCH_SIZE) {
      const result = await Models.Lock.bulkWrite(ops, { ordered: false })
      updated += result.modifiedCount ?? 0
      ops = []
    }
  }

  if (ops.length) {
    const result = await Models.Lock.bulkWrite(ops, { ordered: false })
    updated += result.modifiedCount ?? 0
  }

  skipped = blocks.length - tsMap.size
  return { updated, skipped }
}

export const backfillLockBlockTimestampMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260508082351-backfillLockBlockTimestamp' }))

    try {
      const networks = (await Models.Lock.distinct('network', filter)) as NetworksEnum[]
      logger.info('Networks with null blockTimestamp locks', llo({ count: networks.length, networks }))

      let totalUpdated = 0
      let totalSkipped = 0

      for (const network of networks) {
        const { updated, skipped } = await backfillNetwork(network)
        totalUpdated += updated
        totalSkipped += skipped
        logger.info('Network backfill done', llo({ network, updated, skipped }))
      }

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20260508082351-backfillLockBlockTimestamp',
          totalUpdated,
          totalSkipped,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260508082351-backfillLockBlockTimestamp', error }))
      throw error
    }
  },

  stop: async () => {},
}

export default backfillLockBlockTimestampMigration
