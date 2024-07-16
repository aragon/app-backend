import { Contract, hexlify, toUtf8Bytes, keccak256, type WebSocketProvider } from 'ethers'
import { ConfigState } from '@state/configState'
import { type ENS, NetworksEnum } from '@types'
import BottleneckModule from '@modules/bottleneck'
import { UniversalResolver } from '@artifacts/UniversalResolver'

const EnsHelper = {
  async getEnsWithUniversalResolver(address: string): Promise<ENS | null> {
    const provider = ConfigState.getInstance().getConfigItem(NetworksEnum.ethereumMainnet) as WebSocketProvider
    const universalResolver = '0xce01f8eee7E479C928F8919abD53E553a36CeF67'

    try {
      const contract = new Contract(universalResolver, UniversalResolver.abi as any, provider)
      const packetBytes = hexlify(EnsHelper._addressToPacket(address))

      const result = await BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet)!.schedule(async () =>
        contract.reverse(packetBytes),
      )

      return result[0]
    } catch (error) {
      return null
    }
  },

  _addressToPacket: function (address: string): Uint8Array {
    const packet = address.replace('0x', '').toLowerCase() + '.addr.reverse'

    // Strip leading and trailing `.`
    const value = packet.replace(/^\.|\.$/gm, '')
    if (value.length === 0) return new Uint8Array(1)

    const stringToBytes = (str: string) => toUtf8Bytes(str)

    const bytes = new Uint8Array(stringToBytes(value).length + 2)
    let offset = 0
    const list = value.split('.')
    for (const label of list) {
      let encoded: any = stringToBytes(label)
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
