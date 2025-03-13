import { Contract, hexlify, keccak256, toUtf8Bytes } from 'ethers'
import { type ENS, NetworksEnum } from '@types'
import BottleneckModule from '@modules/bottleneck'
import { UniversalResolver } from '@artifacts/UniversalResolver'
import logger from '@logger'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'helper:EnsHelper' })

const EnsHelper = {
  async getEnsWithUniversalResolver(address: string): Promise<ENS | null> {
    const provider = ProviderModule.getAnyRpcProvider(NetworksEnum.ethereumMainnet)
    const universalResolver = '0xce01f8eee7E479C928F8919abD53E553a36CeF67'

    try {
      const contract = new Contract(universalResolver, UniversalResolver.abi as any, provider)
      const packetBytes = hexlify(EnsHelper._addressToPacket(address))

      const result = await retryRequest(async () =>
        BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          contract.reverse(packetBytes),
        ),
      )

      return result[0]
    } catch (error) {
      logger.silly('Error getting ENS with Universal Resolver', llo({ address, error }))
      return null
    }
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
