import config from '@config'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import type Token from '@models/schema/token'
import ProxyWeb3Provider from '@modules/proxyProvider'
import DbOperations from '@models/utils/dbOperations'

const llo = logger.logMeta.bind(null, { service: 'service:TokenFetcher' })

const TokenFetcher = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start TokenFetcher', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: TokenFetcher.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error TokenFetcher', llo({ error, document }))
      },
      where: {
        $and: [{ refetch: true }],
      },
      batchSize: config.CRAWLER_CONFIG.TOKEN_RATES_BATCH_SIZE,
      concurrency: config.CRAWLER_CONFIG.TOKEN_RATES_CONCURRENCY,
    })

    await crawler.crawl()
  },
  onDocument: async (document: Token) => {
    try {
      const plugin = await Models.Plugin.findByTokenAddress(document.address, document.network)
      if (!plugin) {
        logger.verbose('No plugin found for token during re-fetch.', llo({ document }))
        await DbOperations.updateDocument(
          document,
          { refetch: false },
          {
            logId: document.id,
            network: document.network,
            refetch: false,
          },
          'Token Fetcher No Plugin',
          llo,
        )
        return
      }

      const tokenAddress = document.address
      const network = document.network

      const tokenData = await ProxyWeb3Provider.fetchTokenHolderAndSupply({
        address: tokenAddress,
        network,
      })

      if (tokenData.totalSupply === '0' || tokenData.totalHolders === 0) {
        logger.verbose('Token data not found during refetch', llo({ tokenData, document }))
        return
      }

      await DbOperations.updateDocument(
        document,
        {
          totalSupply: tokenData.totalSupply,
          holders: tokenData.totalHolders,
        },
        {
          logId: document.id,
          network: document.network,
          refetch: false,
        },
        'Token Fetcher Updated',
        llo,
      )
    } catch (error) {
      logger.error('Error onDocument TokenFetcher', llo({ error, document }))
    }
  },
}

export default TokenFetcher
