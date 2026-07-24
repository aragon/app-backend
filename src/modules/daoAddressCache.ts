import { Models } from '@dbModels'
import type { INetworkCacheState, NetworksEnum } from '@types'

/**
 * Re-read window when advancing the cursor, to absorb clock skew between
 * writer processes and same-millisecond inserts. Deltas re-fetch this much
 * history on every refresh; Map inserts are idempotent so overlap is free.
 */
const CURSOR_OVERLAP_MS = 60 * 1000

/**
 * Incremental per-network cache of DAO addresses.
 *
 * First refresh loads the full address list for the network; every later
 * refresh only fetches DAOs created since the cursor (an indexed range scan
 * that is almost always empty). This keeps per-tick freshness identical to
 * querying Mongo directly while avoiding a distinct + large $in per tick and
 * the per-log checksum computation: membership is tested on the lowercase
 * form and the stored checksummed string is returned verbatim.
 *
 * DAO documents are never hard-deleted, so the cache is add-only.
 */
class DaoAddressCache {
  private readonly states = new Map<NetworksEnum, INetworkCacheState>()

  private getState(network: NetworksEnum): INetworkCacheState {
    let state = this.states.get(network)
    if (!state) {
      state = { byLower: new Map(), cursor: null, refreshing: null }
      this.states.set(network, state)
    }
    return state
  }

  async refresh(network: NetworksEnum): Promise<void> {
    const state = this.getState(network)
    if (state.refreshing) return state.refreshing

    state.refreshing = this.doRefresh(network, state).finally(() => {
      state.refreshing = null
    })
    return state.refreshing
  }

  private async doRefresh(network: NetworksEnum, state: INetworkCacheState): Promise<void> {
    const query: Record<string, any> = { network }

    if (state.cursor) {
      query.createdAt = { $gte: new Date(state.cursor.getTime() - CURSOR_OVERLAP_MS) }
    }

    const queryStartedAt = new Date()
    const daos = await Models.Dao.find(query, { address: 1, createdAt: 1 }).lean()

    /**
     * Advance the cursor to at least queryStartedAt (not just the newest
     * document timestamp): with the fixed overlap this keeps the delta window
     * bounded instead of permanently re-fetching the tail on quiet networks,
     * while anything the query raced with stays inside the next window.
     */
    let cursor = state.cursor && state.cursor > queryStartedAt ? state.cursor : queryStartedAt
    for (const dao of daos as unknown as Array<{ address: string; createdAt?: Date }>) {
      state.byLower.set(dao.address.toLowerCase(), dao.address)
      if (dao.createdAt && dao.createdAt > cursor) cursor = dao.createdAt
    }
    state.cursor = cursor
  }

  /**
   * Returns the checksummed DAO address as stored in the DB, or undefined if
   * the address is not a known DAO on this network. Accepts any casing.
   */
  getChecksummed(network: NetworksEnum, address: string): string | undefined {
    return this.getState(network).byLower.get(address.toLowerCase())
  }

  clear(): void {
    this.states.clear()
  }
}

export default new DaoAddressCache()
