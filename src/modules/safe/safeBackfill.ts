/**
 * Reading a Safe once, when it first becomes ours.
 *
 * A Safe granted execute permission has a history and a queue that predate us knowing about it, and
 * events never fill that in - owner and execution events carry only what happens next. So the moment
 * it is registered, its recent past is read once.
 *
 * Nothing here writes anything. `readQueue` and `readHistory` already record what they fetch, so
 * this only has to ask for the pages; the cache, the budget and the tracking gate all apply exactly
 * as they do to a read a person asked for.
 *
 * It stops short on purpose. A Safe that has been busy for years would otherwise let one permission
 * grant spend the whole hour's budget, and the transactions anyone looks at are the recent ones,
 * which the first pages hold.
 *
 * What the cap leaves out stays out. Ordinary reads refresh the first page of the queue and of the
 * history only, so the store is a bounded recent window - the newest `BACKFILL_PAGE_SIZE` pending
 * and `BACKFILL_HISTORY_PAGES` pages of executed - and nothing walks deeper on its own. A caller
 * that needs older history reads it live through `/history`, which pages upstream.
 */

import config from '@config'
import logger from '@logger'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { getSafeShortName, type HexAddress, type ISafeQueue, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'module:SafeBackfill' })

const SafeBackfillModule = {
  async run(network: NetworksEnum, address: string): Promise<void> {
    // Nothing to read on a chain Safe does not serve. Not a failure, just an empty history.
    if (!getSafeShortName(network)) return

    const pageSize = config.SAFE_API.BACKFILL_PAGE_SIZE
    const maxPages = config.SAFE_API.BACKFILL_HISTORY_PAGES
    // The service records only what it fetches; a page cached while the Safe was untracked was
    // never recorded, so every page is recorded here. The upsert is idempotent.
    const record = async (page: ISafeQueue) =>
      SafeTransactionsModule.record(network, address as HexAddress, page.results, Date.now())

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

        // A short page is the end of the history. `next` is the upstream's own answer to that, so a
        // Safe with fewer transactions than the cap costs one read rather than the full allowance.
        if (!result.next) return
      } catch (error) {
        // A refused or failed page ends the backfill rather than retrying into the same wall. The
        // Safe is left with what was read, which ordinary reads go on filling.
        logger.warn('Safe backfill stopped early', llo({ network, address, page, error }))
        return
      }
    }

    logger.info('Safe backfill reached its page cap', llo({ network, address, maxPages }))
  },
}

export default SafeBackfillModule
