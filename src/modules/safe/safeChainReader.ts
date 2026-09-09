/**
 * Safe state read from chain. No Safe Transaction Service involvement at all.
 *
 * Owners, threshold, version, the onchain nonce, the enabled modules and the transaction guard are
 * all plain contract state. Serving them from chain removes one of the two Safe API read kinds a
 * body polls, which halves the shared quota a Safe body consumes and costs nothing per call.
 *
 * Reads go through the network's node limiter and `retryRequest`, exactly like
 * `@helpers/sppBodyCondition`.
 */

import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { SafeReadError } from '@modules/safe/safeError'
import ProviderModule from '@modules/provider'
import { Safe } from '@artifacts/Safe'
import { ISafeErrorCode, type ISafeInfo, type NetworksEnum } from '@types'
import { Contract, dataSlice, getAddress, id, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-chain-reader' })

/**
 * `GuardManager` keeps the guard in its own storage slot and its `getGuard()` is `internal` on every
 * shipped Safe version, so there is no call to make - the slot is read directly. Derived rather than
 * pasted so a typo cannot silently produce a wrong-but-plausible address.
 */
const SAFE_GUARD_STORAGE_SLOT = id('guard_manager.guard.address')
const GUARD_STORAGE_PATTERN = /^0x[0-9a-fA-F]{64}$/

/** `getModulesPaginated` walks a linked list that starts at address 1, not at zero. */
const MODULE_SENTINEL = '0x0000000000000000000000000000000000000001'

// ponytail: one page of modules. Reading further pages is a loop away if a Safe ever enables >100.
const MODULE_PAGE_SIZE = 100

async function readWithNodeLimiter<T>(network: NetworksEnum, read: () => Promise<T>): Promise<T> {
  return retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(read))
}

const SafeChainReaderModule = {
  /**
   * The Safe's live nonce. Its own function because next-nonce allocation needs this value fresh and
   * on its own - a stale onchain nonce with an empty queue allocates a nonce the Safe has already
   * consumed, producing a transaction that can never execute.
   */
  async readNonce(network: NetworksEnum, address: string): Promise<string> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const code = await readWithNodeLimiter(network, () => provider.getCode(address))
      if (code === '0x') {
        throw new SafeReadError(ISafeErrorCode.notFound, 'Safe not found on chain', 404)
      }

      const safe = new Contract(address, Safe.abi, provider)
      const nonce = await readWithNodeLimiter(network, async () => safe.nonce() as Promise<bigint>)

      return BigInt(nonce).toString()
    } catch (error) {
      if (SafeReadError.isSafeReadError(error)) throw error

      logger.warn('Safe: onchain nonce read failed', llo({ network, address, error }))
      throw new SafeReadError(ISafeErrorCode.connectionError, 'The Safe nonce could not be read from chain', 502)
    }
  },

  /**
   * Everything `/v2/safe/:network/:address/info` reports, in one round of parallel calls. The node
   * limiter caps the real concurrency, so issuing them together does not burst the RPC provider.
   *
   * All calls are required. A missing method or malformed response is a failed chain read, not an
   * empty owner/module list that could make a signing UI display false state.
   */
  async readInfo(network: NetworksEnum, address: string): Promise<ISafeInfo> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const code = await readWithNodeLimiter(network, () => provider.getCode(address))
      if (code === '0x') {
        throw new SafeReadError(ISafeErrorCode.notFound, 'Safe not found on chain', 404)
      }

      const safe = new Contract(address, Safe.abi, provider)
      const [owners, threshold, nonce, version, modules, guard] = await Promise.all([
        readWithNodeLimiter(network, async () => safe.getOwners() as Promise<string[]>),
        readWithNodeLimiter(network, async () => safe.getThreshold() as Promise<bigint>),
        readWithNodeLimiter(network, async () => safe.nonce() as Promise<bigint>),
        readWithNodeLimiter(network, async () => safe.VERSION() as Promise<string>),
        readWithNodeLimiter(
          network,
          async () => safe.getModulesPaginated(MODULE_SENTINEL, MODULE_PAGE_SIZE) as Promise<[string[], string]>,
        ).then(([enabled]) => enabled),
        readWithNodeLimiter(network, () => provider.getStorage(address, SAFE_GUARD_STORAGE_SLOT)),
      ])

      const thresholdNumber = Number(threshold)
      if (!Number.isSafeInteger(thresholdNumber) || thresholdNumber <= 0 || thresholdNumber > owners.length) {
        throw new SafeReadError(ISafeErrorCode.invalidResponse, 'Safe returned an invalid threshold', 502)
      }

      if (typeof guard !== 'string' || !GUARD_STORAGE_PATTERN.test(guard)) {
        throw new SafeReadError(ISafeErrorCode.invalidResponse, 'Safe returned an invalid guard slot', 502)
      }

      const guardAddress = getAddress(dataSlice(guard, 12))

      return {
        address: getAddress(address),
        owners: owners.map(owner => getAddress(owner)),
        threshold: thresholdNumber,
        version: String(version),
        nonce: BigInt(nonce).toString(),
        modules: modules.map(module => getAddress(module)),
        guard: guardAddress === ZeroAddress ? null : guardAddress,
      }
    } catch (error) {
      if (SafeReadError.isSafeReadError(error)) throw error

      logger.warn('Safe: chain read failed', llo({ network, address, error }))
      throw new SafeReadError(ISafeErrorCode.connectionError, 'The Safe state could not be read from chain', 502)
    }
  },
}

export default SafeChainReaderModule
