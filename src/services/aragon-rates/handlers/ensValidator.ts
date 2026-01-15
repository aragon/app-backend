import { Models } from '@dbModels'
import EnsHelper from '@helpers/ens'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'

const llo = logger.logMeta.bind(null, { service: 'rates:EnsValidator' })

export const EnsValidator = {
  batchSize: 100,
  concurrency: 10,

  start: async () => {
    logger.info('Start EnsValidator', llo({}))

    const crawler = new DBCrawler({
      model: Models.Member,
      onDocument: EnsValidator.onDocument,
      onError: (error: any, doc: any) => {
        logger.error('EnsValidator error', llo({ error, address: doc?.address }))
      },
      where: {
        ens: { $ne: null, $exists: true },
      },
      batchSize: EnsValidator.batchSize,
      concurrency: EnsValidator.concurrency,
    })

    await crawler.crawl()
    logger.info('EnsValidator completed', llo({}))
  },

  onDocument: async (member: any) => {
    const { address, ens } = member

    // Get current ENS for this address
    const currentEns = await EnsHelper.getEnsWithUniversalResolver(address)

    if (currentEns === ens) {
      // No change
      return
    }

    if (currentEns) {
      // ENS changed to new name → UPDATE
      logger.info('Updating ENS', llo({ address, oldEns: ens, newEns: currentEns }))
      await Models.Member.updateOne({ address }, { $set: { ens: currentEns } })
    } else {
      // ENS expired/removed → SET NULL
      logger.info('Clearing expired ENS', llo({ address, ens }))
      await Models.Member.updateOne({ address }, { $set: { ens: null } })
    }
  },
}
