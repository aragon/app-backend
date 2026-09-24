/**
 * Safe singleton, read-only surface. Enough to answer `/v2/safe/:network/:address/info` from chain
 * instead of from the rate-limited Safe Transaction Service.
 *
 * The transaction guard is absent on purpose: `GuardManager.getGuard()` is `internal` on every
 * shipped Safe version, so the guard is read straight out of its storage slot - see
 * `SAFE_GUARD_STORAGE_SLOT` in `@modules/safe/safeChainReader`.
 */
export const Safe = {
  abi: [
    {
      inputs: [],
      name: 'getOwners',
      outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getThreshold',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'nonce',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'VERSION',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'start', type: 'address' },
        { internalType: 'uint256', name: 'pageSize', type: 'uint256' },
      ],
      name: 'getModulesPaginated',
      outputs: [
        { internalType: 'address[]', name: 'array', type: 'address[]' },
        { internalType: 'address', name: 'next', type: 'address' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
}

/** Safe >= 1.4.0 puts the owner in `topics[1]`; same `topic0` as the <= 1.3.0 shape below. */
export const SafeOwnerEvents = {
  abi: [
    {
      anonymous: false,
      inputs: [{ indexed: true, internalType: 'address', name: 'owner', type: 'address' }],
      name: 'AddedOwner',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: true, internalType: 'address', name: 'owner', type: 'address' }],
      name: 'RemovedOwner',
      type: 'event',
    },
  ],
}

/** Safe <= 1.3.0: same events, owner not indexed. */
export const SafeOwnerEventsLegacy = {
  abi: [
    {
      anonymous: false,
      inputs: [{ indexed: false, internalType: 'address', name: 'owner', type: 'address' }],
      name: 'AddedOwner',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: false, internalType: 'address', name: 'owner', type: 'address' }],
      name: 'RemovedOwner',
      type: 'event',
    },
  ],
}
