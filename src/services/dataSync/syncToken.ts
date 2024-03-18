import logger from '@logger'
import { ErrorKeyEnum } from '@types'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import dayjs from '@helpers/dayjs'
import type Token from '@models/schema/token'
import CovalentHelper from '@helpers/covalent'
import { assert } from '@errors'
import config from '@config'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:sync:SyncToken' })

export const SyncToken = {
  async fetchAll() {
    logger.verbose('Start fetching tokens')

    const crowler = new DBCrawler({
      onDocument: SyncToken._updateToken,
      onError: SyncToken._onError,
      model: Models.Token,
      where: {
        lastUpdatedAt: { $lte: dayjs().utc().subtract(24, 'hour').toDate() },
      },
      concurrency: 1,
      batchSize: config.SERVICES.SYNC_DATA.TOKEN_FETCH_BATCH_SIZE,
    })
    await crowler.crawl()

    logger.verbose('Finish fetching tokens')
  },

  async _updateToken(token: Token) {
    await DbTx.executeTxFn(async({ session }) => {
      const cToken = await CovalentHelper.getToken(token.address, token.network)
      assert(!!cToken, ErrorKeyEnum.notFound)

      await token.update(
        { ...cToken, lastUpdatedAt: dayjs().utc().toDate() },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Token updated', { token })
    })
    // .catch(error => {
    //   logger.error('Error updating token', { error, token })
    // })
  },

  _onError(token: Token, error: any) {
    logger.error(
      'Error while fetching token',
      llo({
        tokenId: token.id,
        address: token.address,
        symbol: token.symbol,
        error,
      }),
    )
  },
}
