import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Lock from '@models/schema/lock'
import Web3Helper from '@helpers/web3'
import configIndexer from '@indexer/configIndexer'
import UnitDepUtils from '@test/lib/unit-dep/utils'

const llo = logger.logMeta.bind(null, { service: 'Migration: fixGoveranceVe' })

export const FixGovernanceVeMigration: IMigration & { fixLock: any } = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250624200948-fixGoveranceVe' }))

    try {
      logger.info('Migration completed successfully', llo({ migration: '20250624200948-fixGoveranceVe' }))

      const crawler = new DBCrawler({
        model: Models.Lock,
        onDocument: async (lock: Lock) => {
          await FixGovernanceVeMigration.fixLock(lock)
        },
        onError: (error: any, document: any) => {
          logger.error('Error fix lock', llo({ error, document }))
        },

        where: { id: { $regex: '^(ethereum-[^-]+)-([^-]+)-([^-]+)-([^-]+)-([^-]+)-([^-]+)-([^-]+)$' } },
        batchSize: 1000,
        concurrency: 10,
      })

      await crawler.crawl()
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250624200948-fixGoveranceVe', error }))
      throw error
    }
  },

  fixLock: async (lockDb: Lock) => {
    const transactionReceipt = await Web3Helper.getTransactionReceipt(lockDb.transactionHash, lockDb.network)
    if (!transactionReceipt?.logs) {
      logger.warn('No transaction receipt found', llo({ lockDb }))
      return
    }

    const eventsToLook = ['Deposit', 'Withdraw', 'MinDepositSet', 'ExitQueued', 'MinLockSet']

    const logsToLook = configIndexer.filter(config => eventsToLook.includes(config.event)).map(config => config.topic)

    const filteredLogs = transactionReceipt.logs.filter(log => logsToLook.includes(log.topics[0]))

    const sortedLogs = filteredLogs.sort((a, b) => a.index - b.index)

    const parsedLogs = await UnitDepUtils.parseLogsByConfig(sortedLogs, lockDb.network)

    for (const { event, handler, info } of parsedLogs) {
      await handler(event, info)
    }

    const locksExistedWithNewIds = await Models.Lock.find({
      transactionHash: lockDb.transactionHash,
    })

    if (locksExistedWithNewIds.length > 1) {
      logger.info(
        'Safely remove the old lock',
        llo({ lockDb: lockDb.id, newLockIds: locksExistedWithNewIds.map(l => l.id) }),
      )
      await Models.Lock.deleteOne({ id: lockDb.id })
    }
  },

  stop: async () => {},
}

export default FixGovernanceVeMigration
