import ContractHelper from '@helpers/contractHelper'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, type NetworksEnum } from '@types'
import { Contract, ethers, getAddress, isAddress, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyContractHelper' })

// A beacon is defined by implementation() only - see EIP-1967
const BEACON_SIGNATURES = ['implementation'] as const

const ProxyContractHelper = {
  /**
   * The bytecode of a minimal proxy follows a specific pattern where the implementation address is embedded
   * after a specific opcode sequence. This function decodes that pattern to retrieve the implementation address.
   *
   * Standard EIP-1167 (45 bytes):
   * 0x363d3d373d3d3d363d73[20-byte implementation address]5af43d82803e903d91602b57fd5bf3
   *
   * Optimised 0age/Solady variant (44 bytes), used by thirdweb clone factories among others:
   * 0x3d3d3d3d363d3d37363d73[20-byte implementation address]5af43d3d93803e602a57fd5bf3
   *
   * ERC-7511 PUSH0 variant (44 bytes):
   * 0x365f5f375f5f365f73[20-byte implementation address]5af43d5f5f3e5f3d91602a57fd5bf3
   *
   * Solady PUSH0 variant:
   * 0x5f5f365f5f37365f73[20-byte implementation address]5af43d5f5f3e6029573d5ffd5b3d5ff3
   *
   * Both the prefix and the trailing delegatecall sequence are matched, so truncated or malformed
   * bytecode that merely opens with the right opcodes cannot yield an address. The suffix is not
   * required to end the code - clone factories may append immutable args after it.
   **/
  _getImplementationForMinimalProxy(byteCode: string): HexAddress | null {
    const minimalProxyPatterns = [
      { prefix: '363d3d373d3d3d363d73', suffix: '5af43d82803e903d91602b57fd5bf3' },
      { prefix: '3d3d3d3d363d3d37363d73', suffix: '5af43d3d93803e602a57fd5bf3' },
      { prefix: '365f5f375f5f365f73', suffix: '5af43d5f5f3e5f3d91602a57fd5bf3' },
      { prefix: '5f5f365f5f37365f73', suffix: '5af43d5f5f3e6029573d5ffd5b3d5ff3' },
    ]

    const code = byteCode.startsWith('0x') ? byteCode.slice(2) : byteCode

    for (const { prefix, suffix } of minimalProxyPatterns) {
      const addressStart = prefix.length
      const addressEnd = addressStart + 40

      if (code.startsWith(prefix) && code.slice(addressEnd).startsWith(suffix)) {
        return ethers.getAddress('0x' + code.slice(addressStart, addressEnd))
      }
    }
    return null
  },

  /**
   * A beacon proxy may hold its beacon in an `immutable`, which lives in the runtime code rather
   * than in the beacon storage slot. For `IBeacon(BEACON).implementation()` solc emits, in order:
   *
   * 635c60da1b60e01b            PUSH4 implementation() selector, shifted into place
   * ...                         calldata scratch setup (a few bytes)
   * 7f 000000000000000000000000 [20-byte beacon]   PUSH32 zero-padded beacon
   * 6001600160a01b0316          mask down to an address
   * 5afa                        STATICCALL
   *
   * All four parts are required and the beacon must sit within 32 bytes of the selector push, so
   * an unrelated embedded address that merely happens to be STATICCALLed cannot match. A match is
   * still only a candidate - the caller must confirm the address answers implementation().
   **/
  _getBeaconFromImmutableBytecode(byteCode: string): HexAddress | null {
    const immutableBeaconPattern =
      /635c60da1b60e01b[0-9a-f]{0,64}?7f000000000000000000000000([0-9a-f]{40})6001600160a01b03165afa/i

    const match = byteCode.match(immutableBeaconPattern)

    return match ? getAddress('0x' + match[1]) : null
  },

  /**
   * A view call is a guess - the proxy delegates into application code, so an unrelated function
   * of the same name can answer it. A candidate only counts if it is a real address, is non-zero,
   * and has deployed code behind it.
   */
  async _validateImplementationCandidate(candidate: unknown, network: NetworksEnum): Promise<HexAddress | null> {
    if (typeof candidate !== 'string' || !isAddress(candidate)) {
      return null
    }

    const implementationAddress = getAddress(candidate)

    if (implementationAddress === ZeroAddress) {
      return null
    }

    const code = await ContractHelper.getBytecode(implementationAddress, network)

    return code ? implementationAddress : null
  },

  async _fallBackImplementationViaViewCall(
    address: string,
    network: NetworksEnum,
    // Callers that know which standard they are talking to can narrow this. A beacon is defined by
    // implementation() alone, so asking it for getImplementation() first risks an unrelated answer.
    signatures: readonly ('getImplementation' | 'implementation')[] = ['getImplementation', 'implementation'],
  ): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(
      address,
      ['function implementation() view returns (address)', 'function getImplementation() view returns (address)'],
      provider,
    )

    // Each signature is tried in turn - one answering with a zero or otherwise unusable address
    // must not stop us from asking the next.
    for (const signature of signatures) {
      try {
        const candidate = await BottleneckModule.getNodeLimiter(network).schedule(async () => contract[signature]())
        const validated = await ProxyContractHelper._validateImplementationCandidate(candidate, network)

        if (validated) {
          return validated
        }
      } catch (_error) {
        // signature not present or reverted, try the next one
      }
    }

    return null
  },

  async getAddressFromStorage(
    provider: any,
    address: string,
    slot: string,
    network: NetworksEnum,
  ): Promise<HexAddress | null> {
    try {
      const method = provider.getStorageAt ? 'getStorageAt' : 'getStorage'
      const storageValue = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider[method](address, slot)),
      )
      const addressFromStorage = getAddress('0x' + storageValue.slice(-40))
      return addressFromStorage === ZeroAddress ? null : addressFromStorage
    } catch (_error) {
      return null
    }
  },

  // Resolution never recurses - every branch either reads a slot, matches bytecode, or asks a
  // beacon directly - so no depth or visited-set guard is needed.
  async getImplementationAddress(address: string, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    try {
      // Check EIP-1967 slot first
      let implementationAddress = await ProxyContractHelper.getAddressFromStorage(
        provider,
        address,
        '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
        network,
      )

      // Check FiatProxy slot if EIP-1967 slot is not valid
      if (!implementationAddress) {
        implementationAddress = await ProxyContractHelper.getAddressFromStorage(
          provider,
          address,
          '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3',
          network,
        )
      }

      // Check minimal proxy pattern if other slots failed
      if (!implementationAddress) {
        const code = await ContractHelper.getBytecode(address, network)
        implementationAddress = code ? ProxyContractHelper._getImplementationForMinimalProxy(code) : null
      }

      // A beacon proxy is resolved before any view call. The beacon slot is authoritative, whereas
      // implementation() on the proxy delegates into application code and can be answered by an
      // unrelated function of the same name - a guess must never pre-empt the standard.
      if (!implementationAddress) {
        implementationAddress = await ProxyContractHelper._getBeaconProxyImplementationAddress(address, network)
      }

      // Fallback via explicit view call if still not found
      if (!implementationAddress) {
        implementationAddress = await ProxyContractHelper._fallBackImplementationViaViewCall(address, network)
      }

      return implementationAddress
    } catch (error) {
      logger.warn('Failed to fetch implementation address', llo({ error, address, network }))
      return null
    }
  },

  // Resolves a beacon proxy by asking the beacon for the implementation it serves. It never
  // resolves the beacon itself as a proxy, so it cannot recurse and takes no depth/visited guard.
  _getBeaconProxyImplementationAddress: async (address: string, network: NetworksEnum) => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes('eip1967.proxy.beacon'))
    const slot = '0x' + (BigInt(hash) - 1n).toString(16)

    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const method = provider.getStorageAt ? 'getStorageAt' : 'getStorage'

      const slotValue = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider[method](address, slot)),
      )

      const slotBeacon =
        slotValue && slotValue !== '0x' && slotValue.length >= 42 ? getAddress('0x' + slotValue.slice(-40)) : null

      if (slotBeacon && slotBeacon !== ZeroAddress) {
        // Ask the beacon which implementation it serves. Resolving the beacon as a proxy instead
        // answers a different question - what the beacon's own logic contract is - and returns a
        // confidently wrong address whenever the beacon is itself upgradeable. A beacon is required
        // to expose implementation(), so one that does not answer is not a beacon we can resolve.
        const servedImplementation = await ProxyContractHelper._fallBackImplementationViaViewCall(
          slotBeacon,
          network,
          BEACON_SIGNATURES,
        )

        if (!servedImplementation) {
          logger.warn('Beacon did not answer implementation()', llo({ address, network, beacon: slotBeacon }))
        }

        return servedImplementation
      }

      // The beacon is not always in storage - when it is declared `immutable` solc bakes it into
      // the runtime code, leaving the beacon slot empty. Recovering it from bytecode is a pattern
      // match rather than a storage read, so the candidate has to prove itself on chain before we
      // trust it, and it never falls back to resolving the candidate as a proxy: a wrong address
      // that happened to match would otherwise yield a confident but completely wrong result.
      const code = await ContractHelper.getBytecode(address, network)
      const candidateBeacon = code ? ProxyContractHelper._getBeaconFromImmutableBytecode(code) : null

      if (!candidateBeacon) {
        return null
      }

      // the view call already rejects a non-address, the zero address and an implementation with
      // no code behind it, so anything it returns here is a beacon that proved itself
      const beaconImplementation = await ProxyContractHelper._fallBackImplementationViaViewCall(
        candidateBeacon,
        network,
        BEACON_SIGNATURES,
      )

      if (!beaconImplementation) {
        logger.warn(
          'Embedded beacon candidate did not answer implementation()',
          llo({ address, network, candidateBeacon }),
        )
      }

      return beaconImplementation
    } catch (e) {
      logger.warn('Failed to fetch beacon proxy implementation address', llo({ error: e, address, network }))
      return null
    }
  },
}

export default ProxyContractHelper
