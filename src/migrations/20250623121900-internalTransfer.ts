import { type IMigHelper, type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Proposal from '@models/schema/proposal'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

const llo = logger.logMeta.bind(null, { service: 'Migration: internalTransfer' })

export const internalTransferMigration: IMigration & IMigHelper = {
  countDocs: 0,

  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250623121900-internalTransfer' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Proposal,
        onDocument: async (proposal: Proposal) => {
          internalTransferMigration.countDocs++
          await DaoTransactions.parseTransactionFromProposalAction(proposal)
          logger.verbose('Processed document', llo({ count: internalTransferMigration.countDocs }))
        },
        onError: (error: any, document: any) => {
          logger.error('Error fix internal transfer on proposal', llo({ error, document }))
        },
        where: {
          rawActions: {
            $elemMatch: {
              value: { $exists: true, $ne: '0' },
            },
          },
          'executed.status': true,
        },
        batchSize: 2000,
        concurrency: 200,
      })

      await crawler.crawl()
      logger.info('Migration completed successfully', llo({ migration: '20250623121900-internalTransfer' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250623121900-internalTransfer', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default internalTransferMigration
