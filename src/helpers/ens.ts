import config from '@config'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type DAO_ENS, type ENS, NetworksEnum } from '@types'
import { Contract, keccak256, toUtf8Bytes, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helper:EnsHelper' })

const RESOLVER_ABI = [
  'function addr(bytes32 node) view returns (address)',
  'function name(bytes32 node) view returns (string)',
]

const ENS_REGISTRY_ABI = [
  'function owner(bytes32 node) external view returns (address)',
  'function resolver(bytes32 node) external view returns (address)',
]

const EnsHelper = {
  ENS_REGISTRY: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
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

  async getEnsWithUniversalResolver(address: string): Promise<ENS | null> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)

    try {
      const name = await retryRequest(() =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(() =>
          provider.lookupAddress(address),
        ),
      )
      return (name as ENS | null) ?? null
    } catch (error) {
      if ((error as { reason?: string }).reason === 'ReverseAddressMismatch(string,bytes)') {
        logger.info('ENS forward resolution does not match address', llo({ address, error }))
        return null
      }
      throw error
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
}

export default EnsHelper
