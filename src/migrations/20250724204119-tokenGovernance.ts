import { IMigHelper, type IMigration, ITokenType } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Token from '@models/schema/token'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import GovernanceVeHelper from '@helpers/governanceVe'

const llo = logger.logMeta.bind(null, { service: 'Migration: tokenGovernance' })

export const tokenGovernanceMigration: IMigration & IMigHelper = {
  countDocs: 0,

  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250627144557-tokenGovernance' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Token,
        onDocument: async (token: Token) => {
          tokenGovernanceMigration.countDocs++
          token.clockMode = await GovernanceErc20Helper.getClockMode(token.address, token.network)

          if (token.type === ITokenType.escrowAdapter) {
            const underlyingTokenInfo = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(
              token.address,
              token.network,
            )
            token.name = underlyingTokenInfo.name
            token.symbol = underlyingTokenInfo.symbol
            token.underlying = underlyingTokenInfo.underlying
          }

          await token.save()
          logger.verbose('Processed document', llo({ count: tokenGovernanceMigration.countDocs }))
        },
        onError: (error: any, document: any) => {
          logger.error(
            'Error save token hasClockMode',
            llo({
              error,
              address: document.address,
              network: document.network,
            }),
          )
        },

        where: {
          isGovernance: true,
        },
        batchSize: 2000,
        concurrency: 200,
      })

      await crawler.crawl()
      logger.info('Migration completed successfully', llo({ migration: '20250627144557-tokenGovernance' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250627144557-tokenGovernance', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default tokenGovernanceMigration
