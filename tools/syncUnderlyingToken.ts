import { Models } from '@dbModels'
import Utils from '@helpers/utils'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import Web3Helper from '@src/helpers/web3'
import { EnumConnection, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:syncUnderlyingToken' })

export const SyncUnderlyingToken: IService & { onDocument: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const tokenCrawler = new DBCrawler({
      model: Models.Token,
      where: {
        underlying: { $exists: false },
      },
      limit: 1000,
      concurrency: 100,
      onError: (error: any, document: any) => {
        logger.error(
          'Error syncing underlying token',
          llo({
            error,
            document,
          }),
        )
      },

      onDocument: SyncUnderlyingToken.onDocument,
    })

    await tokenCrawler.crawl()
  },

  onDocument: async (token: any) => {
    try {
      token.underlying = await Web3Helper.getUnderlying(token.address, token.network)

      await token.save()
    } catch (error) {
      logger.error('Error Sync Underlying Token', llo({ error, token: token.address, network: token.network }))
    } finally {
      await Utils.wait(500)
    }
  },

  stop: async () => {},
}
