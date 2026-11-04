import { Models } from '@dbModels'
import logger from '@logger'
import { TickContext } from '@modules/crawlers/tickContext'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeExecutionTransactionsModule from '@modules/safe/safeExecutionTransactions'
import { EnumConnection, ISafeTransactionState, type IService, ITransactionType } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:backfillSafeExecutionTransactions' })

const BackfillSafeExecutionTransactions: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const counts = { eligible: 0, inserted: 0, enriched: 0, existing: 0, unresolved: 0 }
    const tracked = new Map<string, boolean>()
    let receiptKey = ''
    let context: TickContext | undefined
    const rows = Models.SafeTransaction.find({ state: ISafeTransactionState.executed })
      .sort({ network: 1, transactionHash: 1 })
      .cursor()

    for await (const row of rows) {
      try {
        const safeKey = `${row.network}-${row.safeAddress}`
        if (!tracked.has(safeKey)) {
          tracked.set(safeKey, await SafeBodyMembersModule.isTrackedOrRegistered(row.safeAddress, row.network))
        }
        if (!tracked.get(safeKey)) continue
        counts.eligible++

        const existing = await Models.Transaction.findOne({
          network: row.network,
          daoAddress: row.safeAddress,
          safeTxHash: row.safeTxHash,
          type: ITransactionType.execution,
        })
        if (existing?.source === 'safe') {
          counts.existing++
        } else if (existing) {
          if (!(await SafeExecutionTransactionsModule.enrich(existing.id, row))) {
            throw new Error('Safe execution actions are not ready or the summary no longer exists')
          }
          counts.enriched++
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
      } catch (error) {
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
      }
    }

    logger.info('Safe execution backfill finished', llo(counts))
  },

  stop: async () => {},
}

export default BackfillSafeExecutionTransactions
