import { type NetworksEnum } from '@types'
import { Contract, type WebSocketProvider, ethers } from 'ethers'
import { ConfigState } from '@state/configState'

const ProxyContractHelper = {
  /**
   * The bytecode of a minimal proxy follows a specific pattern where the implementation address is embedded
   * after a specific opcode sequence. This function decodes that pattern to retrieve the implementation address.
   *
   * Minimal proxy bytecode pattern:
   * 0x363d3d373d3d3d363d73[20-byte implementation address]5af43d82803e903d91602b57fd5bf3
   *
   **/

  _getImplementationForMinimalProxy(byteCode: string) {
    const minimalProxyPattern = '0x363d3d373d3d3d363d73'
    const minimalProxyPatternLength = minimalProxyPattern.length

    if (byteCode.startsWith(minimalProxyPattern)) {
      return ethers.getAddress('0x' + byteCode.slice(minimalProxyPatternLength, minimalProxyPatternLength + 40))
    }
    return null
  },

  async _fallBackImplementationViaViewCall(address: string, network: NetworksEnum) {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider
    const contract = new Contract(
      address,
      ['function implementation() view returns (address)', 'function getImplementation() view returns (address)'],
      provider,
    )

    try {
      return await contract.getImplementation()
    } catch (error) {
      // ignore
    }

    try {
      return await contract.implementation()
    } catch (error) {
      // ignore
    }

    return null
  },

  async getImplementationAddress(address: string, network: NetworksEnum): Promise<string | null> {
    try {
      const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider
      const ERC1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

      const storageValue = await provider.getStorage(address, ERC1967_IMPLEMENTATION_SLOT)
      let implementationAddress: any = ethers.getAddress('0x' + storageValue.slice(-40))

      if (implementationAddress === ethers.ZeroAddress) {
        implementationAddress = ProxyContractHelper._getImplementationForMinimalProxy(await provider.getCode(address))

        if (implementationAddress === ethers.ZeroAddress) {
          implementationAddress = await ProxyContractHelper._fallBackImplementationViaViewCall(address, network)
        }
      }

      return implementationAddress === ethers.ZeroAddress ? null : implementationAddress
    } catch (error) {
      return null
    }
  },
}

export default ProxyContractHelper
