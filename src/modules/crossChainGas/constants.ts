/**
 * Gas budget handed to the simulated `ccipReceive`. Deliberately huge: the endpoint measures
 * consumption at an unconstrained budget, it does not search for a minimum. Roughly a destination
 * block gas limit; anything the payload could plausibly need fits inside it.
 */
export const SIMULATION_GAS_CEILING = 30_000_000

/** Bounds on caller-supplied calldata: this endpoint triggers a third-party simulation. */
export const MAX_ACTIONS = 50

/**
 * The result depends on destination state, which moves - so cache only long enough to absorb
 * double-clicks, never long enough to serve something stale.
 */
export const CACHE_TTL_MS = 60_000
export const CACHE_MAX_ENTRIES = 500
