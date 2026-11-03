/**
 * Gas budget handed to the simulated `ccipReceive`. Deliberately huge: the endpoint measures
 * consumption at an unconstrained budget, it does not search for a minimum. Roughly a destination
 * block gas limit; anything the payload could plausibly need fits inside it.
 */
export const SIMULATION_GAS_CEILING = 30_000_000

/** Bounds on caller-supplied calldata: this endpoint triggers a third-party simulation. */
export const MAX_ACTIONS = 50
export const MAX_ACTION_CALLDATA_BYTES = 16 * 1024
export const MAX_TOTAL_CALLDATA_BYTES = 64 * 1024
