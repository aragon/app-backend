import { type HexAddress, type NetworksEnum } from '@types'
import { Contract, ethers, getAddress, ZeroAddress } from 'ethers'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'

const llo = logger.logMeta.bind(null, { service: 'helpers:ProxyContractHelper' })

const ProxyContractHelper = {
  /**
   * The bytecode of a minimal proxy follows a specific pattern where the implementation address is embedded
   * after a specific opcode sequence. This function decodes that pattern to retrieve the implementation address.
   *
   * Minimal proxy bytecode pattern:
   * 0x363d3d373d3d3d363d73[20-byte implementation address]5af43d82803e903d91602b57fd5bf3
   *
   **/

  _getImplementationForMinimalProxy(byteCode: string): HexAddress | null {
    const minimalProxyPattern = '0x363d3d373d3d3d363d73'
    const minimalProxyPatternLength = minimalProxyPattern.length

    if (byteCode.startsWith(minimalProxyPattern)) {
      return ethers.getAddress('0x' + byteCode.slice(minimalProxyPatternLength, minimalProxyPatternLength + 40))
    }
    return null
  },

  async _fallBackImplementationViaViewCall(address: string, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(
      address,
      ['function implementation() view returns (address)', 'function getImplementation() view returns (address)'],
      provider,
    )

    try {
      return await BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getImplementation())
    } catch (error) {
      // ignore
    }

    try {
      return await BottleneckModule.getNodeLimiter(network).schedule(async () => contract.implementation())
    } catch (error) {
      // ignore
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
      const storageValue = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getStorageAt(address, slot)),
      )
      const addressFromStorage = getAddress('0x' + storageValue.slice(-40))
      return addressFromStorage === ZeroAddress ? null : addressFromStorage
    } catch (error) {
      return null
    }
  },

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
        const code = await BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getCode(address))
        implementationAddress = ProxyContractHelper._getImplementationForMinimalProxy(code)
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
}

export default ProxyContractHelper
