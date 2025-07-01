import { type IMigration, NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Proposal from '@models/schema/proposal'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'

const llo = logger.logMeta.bind(null, { service: 'Migration: internalTransfer' })

export const internalTransferMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250623121900-internalTransfer' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Proposal,
        onDocument: async (proposal: Proposal) => {
          await DaoTransactions.parseTransactionFromProposalAction(proposal)
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
        batchSize: 1000,
        concurrency: 10,
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
