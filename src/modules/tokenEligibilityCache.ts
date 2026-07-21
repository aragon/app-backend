import { Models } from '@dbModels'
import { IPluginInterfaceType, IPluginStatus, type ITokenEligibilityCacheState, type NetworksEnum } from '@types'

/**
 * Re-read window when advancing the cursors, to absorb clock skew between
 * writer processes and same-millisecond updates. Deltas re-fetch this much
 * history on every refresh; map upserts/removals are idempotent so overlap
 * is free.
 */
const CURSOR_OVERLAP_MS = 60 * 1000

const pluginEligibility = {
  status: IPluginStatus.installed,
  isSupported: true,
  interfaceType: IPluginInterfaceType.tokenVoting,
}

const tokenEligibility = {
  ignoreTransfer: { $ne: true },
  hasDelegate: true, // only tokens that have delegate votes need to be synced
}

/**
 * Incremental per-network cache of token addresses whose DelegateVotesChanged
 * events must be processed.
 *
 * Eligibility mirrors the previous per-tick queries: the token must be the
 * tokenAddress of an installed/supported tokenVoting Plugin AND a Token with
 * hasDelegate and not ignoreTransfer — the intersection is evaluated at
 * lookup time from two maps.
 *
 * Unlike DAO addresses, Plugin/Token eligibility mutates (status, flags), so
 * the cursors track `updatedAt` and each changed document is re-verified with
 * the eligibility filters to be added or REMOVED from its map. Membership is
 * tested on the lowercase form; the stored checksummed string is returned
 * verbatim so DB queries and handlers never receive a lowercased address.
 */
class TokenEligibilityCache {
  private readonly states = new Map<NetworksEnum, ITokenEligibilityCacheState>()

  private getState(network: NetworksEnum): ITokenEligibilityCacheState {
    let state = this.states.get(network)
    if (!state) {
      state = {
        pluginTokensByLower: new Map(),
        tokensByLower: new Map(),
        pluginCursor: null,
        tokenCursor: null,
        refreshing: null,
      }
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

  private async doRefresh(network: NetworksEnum, state: ITokenEligibilityCacheState): Promise<void> {
    await Promise.all([this.refreshPluginTokens(network, state), this.refreshTokens(network, state)])
  }

  private async refreshPluginTokens(network: NetworksEnum, state: ITokenEligibilityCacheState): Promise<void> {
    /**
     * Snapshot BEFORE the query so the initial cursor can never be newer than
     * a document the scan raced with (see DaoAddressCache for the rationale).
     */
    const queryStartedAt = new Date()

    if (!state.pluginCursor) {
      const addresses = await Models.Plugin.distinct('tokenAddress', { ...pluginEligibility, network })
      for (const address of addresses) {
        if (address) state.pluginTokensByLower.set(address.toLowerCase(), address)
      }
      state.pluginCursor = queryStartedAt
      return
    }

    const changed = await Models.Plugin.find(
      { network, updatedAt: { $gte: new Date(state.pluginCursor.getTime() - CURSOR_OVERLAP_MS) } },
      { tokenAddress: 1, updatedAt: 1 },
    ).lean()

    /**
     * Advance the cursor to at least queryStartedAt (not just the newest
     * document timestamp) so the delta window stays bounded instead of
     * permanently re-fetching the tail; the overlap keeps races covered.
     */
    const changedAddresses = new Set<string>()
    let cursor = state.pluginCursor > queryStartedAt ? state.pluginCursor : queryStartedAt
    for (const plugin of changed as unknown as Array<{ tokenAddress?: string; updatedAt?: Date }>) {
      if (plugin.tokenAddress) changedAddresses.add(plugin.tokenAddress)
      if (plugin.updatedAt && plugin.updatedAt > cursor) cursor = plugin.updatedAt
    }
    state.pluginCursor = cursor

    if (changedAddresses.size === 0) return

    /**
     * Re-verify each changed tokenAddress against the full eligibility filter:
     * another still-eligible plugin may share the same token, so removal is
     * only correct when NO eligible plugin references it anymore.
     */
    const eligible = await Models.Plugin.distinct('tokenAddress', {
      ...pluginEligibility,
      tokenAddress: { $in: [...changedAddresses] },
      network,
    })
    const eligibleByLower = new Map<string, string>()
    for (const address of eligible) {
      if (address) eligibleByLower.set(address.toLowerCase(), address)
    }

    for (const address of changedAddresses) {
      const lower = address.toLowerCase()
      const canonical = eligibleByLower.get(lower)
      if (canonical) {
        state.pluginTokensByLower.set(lower, canonical)
      } else {
        state.pluginTokensByLower.delete(lower)
      }
    }
  }

  private async refreshTokens(network: NetworksEnum, state: ITokenEligibilityCacheState): Promise<void> {
    const queryStartedAt = new Date()

    if (!state.tokenCursor) {
      const addresses = await Models.Token.distinct('address', { ...tokenEligibility, network })
      for (const address of addresses) {
        if (address) state.tokensByLower.set(address.toLowerCase(), address)
      }
      state.tokenCursor = queryStartedAt
      return
    }

    const changed = await Models.Token.find(
      { network, updatedAt: { $gte: new Date(state.tokenCursor.getTime() - CURSOR_OVERLAP_MS) } },
      { address: 1, updatedAt: 1 },
    ).lean()

    /**
     * Advance the cursor to at least queryStartedAt (not just the newest
     * document timestamp) so the delta window stays bounded instead of
     * permanently re-fetching the tail; the overlap keeps races covered.
     */
    const changedAddresses = new Set<string>()
    let cursor = state.tokenCursor > queryStartedAt ? state.tokenCursor : queryStartedAt
    for (const token of changed as unknown as Array<{ address?: string; updatedAt?: Date }>) {
      if (token.address) changedAddresses.add(token.address)
      if (token.updatedAt && token.updatedAt > cursor) cursor = token.updatedAt
    }
    state.tokenCursor = cursor

    if (changedAddresses.size === 0) return

    const eligible = await Models.Token.distinct('address', {
      ...tokenEligibility,
      address: { $in: [...changedAddresses] },
      network,
    })
    const eligibleByLower = new Map<string, string>()
    for (const address of eligible) {
      if (address) eligibleByLower.set(address.toLowerCase(), address)
    }

    for (const address of changedAddresses) {
      const lower = address.toLowerCase()
      const canonical = eligibleByLower.get(lower)
      if (canonical) {
        state.tokensByLower.set(lower, canonical)
      } else {
        state.tokensByLower.delete(lower)
      }
    }
  }

  /**
   * Returns the checksummed token address as stored in the DB when the token
   * is eligible on this network (present in both maps), otherwise undefined.
   * Accepts any casing.
   */
  getChecksummed(network: NetworksEnum, address: string): string | undefined {
    const state = this.getState(network)
    const lower = address.toLowerCase()
    const token = state.tokensByLower.get(lower)
    if (!token) return undefined
    return state.pluginTokensByLower.has(lower) ? token : undefined
  }

  clear(): void {
    this.states.clear()
  }
}

export default new TokenEligibilityCache()
