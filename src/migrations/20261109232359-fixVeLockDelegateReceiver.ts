import { Models } from '@dbModels'
import logger from '@logger'
import type { IMigration } from '@types'

const MIGRATION = '20261109232359-fixVeLockDelegateReceiver'
const llo = logger.logMeta.bind(null, { service: 'Migration: fixVeLockDelegateReceiver' })
const BATCH_SIZE = 500

type LatestDelegation = {
  _id: { network: string; contractAddress: string; tokenId: string }
  delegateReceiverAddress: string | null
}

export const fixVeLockDelegateReceiverMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const latest = new Map<string, string | null>()
      const delegations = Models.TokenDelegation.aggregate([
        {
          $project: {
            network: 1,
            contractAddress: 1,
            tokenIds: 1,
            action: 1,
            delegate: 1,
            blockNumber: 1,
            transactionIndex: 1,
            logIndex: 1,
          },
        },
        { $sort: { blockNumber: -1, transactionIndex: -1, logIndex: -1 } },
        { $unwind: '$tokenIds' },
        {
          $group: {
            _id: { network: '$network', contractAddress: '$contractAddress', tokenId: '$tokenIds' },
            delegateReceiverAddress: {
              $first: { $cond: [{ $eq: ['$action', 'delegate'] }, '$delegate', null] },
            },
          },
        },
      ])
        .allowDiskUse(true)
        .cursor() as AsyncIterable<LatestDelegation>

      for await (const row of delegations) {
        latest.set(`${row._id.network}:${row._id.contractAddress}:${row._id.tokenId}`, row.delegateReceiverAddress)
      }

      const locks = Models.Lock.find(
        {},
        { _id: 1, network: 1, tokenAddress: 1, tokenId: 1, delegateReceiverAddress: 1 },
      )
        .lean()
        .cursor()

      let ops: any[] = []
      let updated = 0
      for await (const lock of locks) {
        const key = `${lock.network}:${lock.tokenAddress}:${lock.tokenId}`
        if (!latest.has(key)) continue

        const delegateReceiverAddress = latest.get(key)!
        if (lock.delegateReceiverAddress === delegateReceiverAddress) continue

        ops.push({
          updateOne: {
            filter: { _id: lock._id },
            update: { $set: { delegateReceiverAddress } },
          },
        })

        if (ops.length >= BATCH_SIZE) {
          const result = await Models.Lock.bulkWrite(ops, { ordered: false })
          updated += result.modifiedCount
          ops = []
        }
      }

      if (ops.length > 0) {
        const result = await Models.Lock.bulkWrite(ops, { ordered: false })
        updated += result.modifiedCount
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION, updated }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default fixVeLockDelegateReceiverMigration
