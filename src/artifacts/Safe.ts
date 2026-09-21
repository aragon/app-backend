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

/**
 * Owner-change events, in the two shapes Safe has shipped. `topic0` is `keccak256` of the
 * signature and so identical for both - only the decode differs: Safe >= 1.4.0 puts the owner in
 * `topics[1]`, Safe <= 1.3.0 puts it in `data`. The indexer tries each ABI in turn, so both are
 * registered for the same topic.
 *
 * `ChangedThreshold` is deliberately absent: membership does not depend on the threshold, and the
 * live threshold is read from chain by `SafeChainReaderModule.readInfo`.
 */
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

/**
 * Execution events. `txHash` is the Safe transaction hash, which is the key a stored Safe
 * transaction is written under - so the event points straight at its row with nothing to match on.
 *
 * `ExecutionFailure` matters as much as the success: a failed execution still consumed the nonce,
 * so the transaction is just as dead and an owner needs to see that rather than watch it vanish.
 */
export const SafeExecutionEvents = {
  abi: [
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'bytes32', name: 'txHash', type: 'bytes32' },
        { indexed: false, internalType: 'uint256', name: 'payment', type: 'uint256' },
      ],
      name: 'ExecutionSuccess',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'bytes32', name: 'txHash', type: 'bytes32' },
        { indexed: false, internalType: 'uint256', name: 'payment', type: 'uint256' },
      ],
      name: 'ExecutionFailure',
      type: 'event',
    },
  ],
}

/** Safe <= 1.3.0: same events, `txHash` not indexed. */
export const SafeExecutionEventsLegacy = {
  abi: [
    {
      anonymous: false,
      inputs: [
        { indexed: false, internalType: 'bytes32', name: 'txHash', type: 'bytes32' },
        { indexed: false, internalType: 'uint256', name: 'payment', type: 'uint256' },
      ],
      name: 'ExecutionSuccess',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: false, internalType: 'bytes32', name: 'txHash', type: 'bytes32' },
        { indexed: false, internalType: 'uint256', name: 'payment', type: 'uint256' },
      ],
      name: 'ExecutionFailure',
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
