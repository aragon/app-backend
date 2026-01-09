import { Models } from '@dbModels'
import TokenDetector from '@helpers/tokenDetector'
import logger from '@logger'
import type Token from '@models/schema/token'
import DBCrawler from '@models/utils/crawler'
import { EnumConnection, type IService } from '@types'

export const SyncTokens: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: async (token: Token) => {
        const tokenTypeInfo = await TokenDetector.detectTokenType(token.address, token.network)
        await token.update({
          hasDelegate: tokenTypeInfo.hasDelegate,
        })
      },
      onError: (error: any, document: any) => {
        logger.error('Error Token hasDelegate', { document, error })
      },
      where: {
        hasDelegate: { $exists: false },
      },
      batchSize: 500,
      concurrency: 10,
    })

    await crawler.crawl()
    logger.info('Tokens updated')
  },

  stop: async () => {},
}

export default SyncTokens
