/**
 * Reads a Safe's recent queue and history once when it is registered; events only carry what
 * happens next. Capped at `BACKFILL_HISTORY_PAGES` so one grant cannot spend the hour's budget.
 * Ordinary reads refresh only the first pages, so the store stays a bounded recent window; older
 * history is read live through `/history`.
 */

import config from '@config'
import logger from '@logger'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { getSafeShortName, type HexAddress, type ISafeQueueResponse, type NetworksEnum } from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBackfill' })

const SafeBackfillModule = {
  async run(network: NetworksEnum, rawAddress: string): Promise<void> {
    if (!getSafeShortName(network)) return

    // Rows are keyed by the checksummed address.
    const address = getAddress(rawAddress) as HexAddress
    const pageSize = config.SAFE_API.BACKFILL_PAGE_SIZE
    const maxPages = config.SAFE_API.BACKFILL_HISTORY_PAGES
    // A page cached while the Safe was untracked was never recorded, so every page is recorded here.
    const record = async (page: ISafeQueueResponse) =>
      SafeTransactionsModule.record(network, address, page.results, Date.parse(page.meta.fetchedAt))

    try {
      await record(await SafeServiceModule.readQueue(network, address, pageSize, 0))
    } catch (error) {
      logger.warn('Safe backfill could not read the queue', llo({ network, address, error }))
    }

    for (let page = 0; page < maxPages; page += 1) {
      try {
        const result = await SafeServiceModule.readHistory(network, address, {
          limit: pageSize,
          offset: page * pageSize,
        })
        await record(result)

        if (!result.next) return
      } catch (error) {
        // A refused or failed page ends the backfill; ordinary reads go on filling the store.
        logger.warn('Safe backfill stopped early', llo({ network, address, page, error }))
        return
      }
    }

    logger.info('Safe backfill reached its page cap', llo({ network, address, maxPages }))
  },
}

export default SafeBackfillModule
