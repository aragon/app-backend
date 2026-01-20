import { UniversalResolver } from '@artifacts/UniversalResolver'
import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type DAO_ENS, type ENS, NetworksEnum } from '@types'
import { Contract, hexlify, keccak256, toUtf8Bytes, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:EnsHelper' })

const RESOLVER_ABI = [
  'function addr(bytes32 node) view returns (address)',
  'function name(bytes32 node) view returns (string)',
]

const ENS_REGISTRY_ABI = [
  'function owner(bytes32 node) external view returns (address)',
  'function resolver(bytes32 node) external view returns (address)',
]

// BaseRegistrar for .eth domains - used to check expiration
const BASE_REGISTRAR_ABI = ['function nameExpires(uint256 id) view returns (uint256)']

const EnsHelper = {
  ENS_REGISTRY: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
  UNIVERSAL_RESOLVER: '0xce01f8eee7E479C928F8919abD53E553a36CeF67',
  BASE_REGISTRAR: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', // BaseRegistrar for .eth domains
  DAO_ETH_NODE: '0x07e52dde31bd8c3670cb40a6f5491766acfda440926cc88a6b31f3e98fc9bd00', // namehash of 'dao.eth'
  DAO_ETH_MANAGER: '0xfb633F47A84a1450EE0413f2C32dC1772CcAea3e', // Manager for dao.eth

  async getDaoEns({
    daoAddress,
    subdomain,
  }: {
    daoAddress: string
    subdomain: string | null
  }): Promise<DAO_ENS | null> {
    if (!subdomain) return null

    const ensSubDomain = await EnsHelper.getDaoEthSubdomain(subdomain)
    if (!ensSubDomain) return null

    const isOwner = await EnsHelper.isAddressOwnerOfSubdomain(daoAddress, subdomain)
    if (!isOwner) return null

    return ensSubDomain
  },

  /**
   * Resolve an address to ENS name using Universal Resolver
   * Also validates that the ENS is not expired and forward resolution matches
   */
  async getEnsWithUniversalResolver(address: string): Promise<ENS | null> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      const contract = new Contract(EnsHelper.UNIVERSAL_RESOLVER, UniversalResolver.abi as any, provider)
      const packetBytes = hexlify(EnsHelper._addressToPacket(address))

      const result = await retryRequest(async () =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          contract.reverse(packetBytes),
        ),
      )

      const ensName = result[0] as ENS | null
      if (!ensName) {
        return null
      }

      // Validate ENS is not expired and forward resolution matches
      const isValid = await EnsHelper.isEnsValidForAddress(ensName, address)
      if (!isValid) {
        logger.info('ENS is expired or no longer resolves to address', llo({ address, ensName }))
        return null
      }

      return ensName
    } catch (error) {
      logger.silly('Error getting ENS with Universal Resolver', llo({ address, error }))
      return null
    }
  },

  /**
   * Validate that an ENS name is valid for an address
   * Checks: 1) ENS is not expired, 2) Forward resolution matches the address
   */
  async isEnsValidForAddress(ensName: ENS, address: string): Promise<boolean> {
    try {
      // Check 1: Verify ENS is not expired (only for .eth domains)
      if (ensName.endsWith('.eth') && !ensName.includes('.dao.eth')) {
        const isExpired = await EnsHelper.isEnsExpired(ensName)
        if (isExpired) {
          logger.info('ENS is expired', llo({ ensName }))
          return false
        }
      }

      // Check 2: Verify forward resolution (ENS -> address) matches
      const forwardAddress = await EnsHelper.resolveEnsToAddress(ensName)
      if (!forwardAddress || forwardAddress.toLowerCase() !== address.toLowerCase()) {
        logger.info('ENS forward resolution does not match address', llo({ ensName, address, forwardAddress }))
        return false
      }

      return true
    } catch (error) {
      logger.silly('Error validating ENS for address', llo({ ensName, address, error }))
      return false
    }
  },

  /**
   * Check if a .eth ENS domain is expired
   */
  async isEnsExpired(ensName: ENS): Promise<boolean> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      // Extract the label (e.g., 'vitalik' from 'vitalik.eth')
      const label = ensName
        .replace(/\.eth$/i, '')
        .split('.')
        .pop()
      if (!label) {
        return false
      }

      // Calculate token ID from label hash
      const labelHash = keccak256(toUtf8Bytes(label))
      const tokenId = BigInt(labelHash)

      const registrar = new Contract(EnsHelper.BASE_REGISTRAR, BASE_REGISTRAR_ABI, provider)
      const expiresTimestamp = await retryRequest(async () =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          registrar.nameExpires(tokenId),
        ),
      )

      const expiresDate = new Date(Number(expiresTimestamp) * 1000)
      const now = new Date()

      return expiresDate < now
    } catch (error) {
      logger.silly('Error checking ENS expiration', llo({ ensName, error }))
      // If we can't check expiration, assume it's valid to avoid false positives
      return false
    }
  },

  /**
   * Resolve ENS name to address (forward resolution)
   */
  async resolveEnsToAddress(ensName: ENS): Promise<string | null> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      const registry = new Contract(EnsHelper.ENS_REGISTRY, ENS_REGISTRY_ABI, provider)
      const node = EnsHelper._namehash(ensName)

      const resolverAddress = await retryRequest(async () =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          registry.resolver(node),
        ),
      )

      if (!resolverAddress || resolverAddress === ZeroAddress) {
        return null
      }

      const resolver = new Contract(resolverAddress, RESOLVER_ABI, provider)
      const resolvedAddress = await retryRequest(async () =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(async () => resolver.addr(node)),
      )

      if (!resolvedAddress || resolvedAddress === ZeroAddress) {
        return null
      }

      return resolvedAddress
    } catch (error) {
      logger.silly('Error resolving ENS to address', llo({ ensName, error }))
      return null
    }
  },

  /**
   * Get specific subdomain exists under dao.eth
   */
  async getDaoEthSubdomain(subdomain: string): Promise<DAO_ENS | null> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      // Clean the input - remove .dao.eth if it was included
      const cleanSubdomain = subdomain.replace(/\.dao\.eth$/i, '')

      const registry = new Contract(EnsHelper.ENS_REGISTRY, ENS_REGISTRY_ABI, provider)
      const fullName = `${cleanSubdomain}.${config.ENS_DOMAIN}` as DAO_ENS
      const node = EnsHelper._namehash(fullName)

      // Check if this node has an owner
      const owner = await registry.owner(node)

      if (owner && owner !== ZeroAddress) {
        return fullName
      }

      return null
    } catch (error) {
      logger.error('Error checking subdomain existence', llo({ subdomain, error }))
      return null
    }
  },

  /**
   * Check if an address is associated with a dao.eth subdomain
   * @param address The Ethereum address to check
   * @param subdomain The subdomain to check (without .dao.eth)
   * @returns True if the address is associated with the subdomain, false otherwise
   */
  async isAddressOwnerOfSubdomain(address: string, subdomain: string): Promise<boolean> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      const cleanSubdomain = subdomain.replace(/\.dao\.eth$/i, '')
      const fullName = `${cleanSubdomain}.${config.ENS_DOMAIN}`
      const node = EnsHelper._namehash(fullName)

      const registry = new Contract(EnsHelper.ENS_REGISTRY, ENS_REGISTRY_ABI, provider)
      const owner = await registry.owner(node)

      if (owner && owner.toLowerCase() === address.toLowerCase()) {
        return true
      }

      const resolverAddress = await registry.resolver(node)

      if (resolverAddress && resolverAddress !== ZeroAddress) {
        const resolver = new Contract(resolverAddress, RESOLVER_ABI, provider)
        try {
          const resolvedAddress = await resolver.addr(node)
          if (resolvedAddress && resolvedAddress.toLowerCase() === address.toLowerCase()) {
            return true
          }
        } catch (resolverError) {
          logger.silly('Error checking resolver', llo({ fullName, error: resolverError }))
        }
      }
      return false
    } catch (error) {
      logger.error('Error checking if address owns subdomain', llo({ address, subdomain, error }))
      return false
    }
  },

  _namehash(name: string): string {
    let node = '0x0000000000000000000000000000000000000000000000000000000000000000'

    if (name) {
      const labels = name.split('.')

      for (let i = labels.length - 1; i >= 0; i--) {
        const labelHash = keccak256(toUtf8Bytes(labels[i]))
        node = keccak256(Buffer.concat([Buffer.from(node.slice(2), 'hex'), Buffer.from(labelHash.slice(2), 'hex')]))
      }
    }

    return node
  },

  _stringToBytes(str: string) {
    return toUtf8Bytes(str)
  },

  _addressToPacket: function (address: string): Uint8Array {
    const packet = address.replace('0x', '').toLowerCase() + '.addr.reverse'

    if (packet === '.addr.reverse') return new Uint8Array(1)

    const value = packet.replace(/^\.|\.$/gm, '')
    if (value.length === 0) return new Uint8Array(1)

    const bytes = new Uint8Array(EnsHelper._stringToBytes(value).length + 2)
    let offset = 0
    const list = value.split('.')
    for (const label of list) {
      let encoded: any = EnsHelper._stringToBytes(label)
      if (encoded.length > 255) {
        encoded = hexlify(keccak256(encoded))
      }

      bytes[offset] = encoded.length
      bytes.set(encoded, offset + 1)
      offset += encoded.length + 1
    }

    if (bytes.length !== offset + 1) return bytes.slice(0, offset + 1)
    return bytes
  },
}

export default EnsHelper
