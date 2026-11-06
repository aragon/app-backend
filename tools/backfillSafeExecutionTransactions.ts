import { Models } from '@dbModels'
import logger from '@logger'
import type SafeTransaction from '@models/schema/safeTransaction'
import DBCrawler from '@models/utils/crawler'
import { TickContext } from '@modules/crawlers/tickContext'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeExecutionTransactionsModule from '@modules/safe/safeExecutionTransactions'
import { EnumConnection, ISafeTransactionState, type IService, ITransactionType } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:backfillSafeExecutionTransactions' })

const BackfillSafeExecutionTransactions: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const execute = process.env.EXECUTE === 'true'
    const counts = { eligible: 0, inserted: 0, enriched: 0, existing: 0, unresolved: 0 }
    const tracked = new Map<string, boolean>()
    let receiptKey = ''
    let context: TickContext | undefined
    const where = { state: ISafeTransactionState.executed }

    logger.info(
      execute ? 'Safe execution backfill started' : 'Safe execution backfill dry run started',
      llo({ total: await Models.SafeTransaction.countDocuments(where) }),
    )

    const crawler = new DBCrawler({
      model: Models.SafeTransaction,
      where,
      sort: { network: 1, transactionHash: 1 },
      batchSize: 500,
      concurrency: 1,
      onDocument: async (row: SafeTransaction, stat: { nbWorked: number; nbTotal: number }) => {
        try {
          const safeKey = `${row.network}-${row.safeAddress}`
          if (!tracked.has(safeKey)) {
            tracked.set(safeKey, await SafeBodyMembersModule.isTrackedOrRegistered(row.safeAddress, row.network))
          }
          if (!tracked.get(safeKey)) return
          counts.eligible++

          const existing = await Models.Transaction.findOne({
            network: row.network,
            daoAddress: row.safeAddress,
            safeTxHash: row.safeTxHash,
            type: ITransactionType.execution,
          })
          if (existing?.source === 'safe' && existing.nonce != null) {
            counts.existing++
          } else if (existing) {
            if (execute && !(await SafeExecutionTransactionsModule.enrich(existing.id, row))) {
              throw new Error('Safe execution actions are not ready or the summary no longer exists')
            }
            counts.enriched++
          } else if (!execute) {
            counts.inserted++
          } else {
            const key = `${row.network}-${row.transactionHash}`
            if (key !== receiptKey) {
              receiptKey = key
              context = new TickContext(row.network, [])
            }
            const result = await SafeExecutionTransactionsModule.backfill(row, context)
            if (result.inserted) counts.inserted++
            else if (result.enriched) counts.enriched++
            else counts.existing++
          }
        } finally {
          if (stat.nbWorked % 100 === 0 || stat.nbWorked === stat.nbTotal) {
            logger.info(
              'Safe execution backfill progress',
              llo({ worked: stat.nbWorked, total: stat.nbTotal, ...counts }),
            )
          }
        }
      },
      onError: (error: Error, row: SafeTransaction) => {
        counts.unresolved++
        logger.warn(
          'Safe execution backfill unresolved',
          llo({
            network: row.network,
            safeAddress: row.safeAddress,
            safeTxHash: row.safeTxHash,
            transactionHash: row.transactionHash,
            error,
          }),
        )
      },
    })
    const { nbTotal } = await crawler.crawl()

    logger.info(
      execute ? 'Safe execution backfill finished' : 'Safe execution backfill dry run, set EXECUTE=true to apply',
      llo({ total: nbTotal, ...counts }),
    )
  },

  stop: async () => {},
}

export default BackfillSafeExecutionTransactions
