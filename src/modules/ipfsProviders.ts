import { createHash } from 'node:crypto'

// Verified provider fetch primitives: decode a CID, verify block bytes against its digest,
// and unwrap single-block dag-pb/UnixFS envelopes. No dependencies beyond node:crypto.

export const CODEC_RAW = 0x55
export const CODEC_DAG_PB = 0x70

const HASH_SHA2_256 = 0x12

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export interface IDecodedCid {
  version: 0 | 1
  codec: typeof CODEC_RAW | typeof CODEC_DAG_PB
  digest: Buffer
}

const IpfsProviders = {
  decodeCid: (cid: string): IDecodedCid | null => {
    try {
      if (cid.startsWith('Qm')) {
        // CIDv0: bare base58btc multihash, dag-pb implied
        const bytes = IpfsProviders._base58Decode(cid)
        if (bytes?.length !== 34 || bytes[0] !== HASH_SHA2_256 || bytes[1] !== 0x20) {
          return null
        }
        return { version: 0, codec: CODEC_DAG_PB, digest: Buffer.from(bytes.subarray(2)) }
      }

      // CIDv1: multibase base32 lowercase ("b" prefix)
      if (!cid.startsWith('b')) {
        return null
      }
      const bytes = IpfsProviders._base32Decode(cid.slice(1))
      if (!bytes) {
        return null
      }

      const reader = { bytes, offset: 0 }
      const version = IpfsProviders._readVarint(reader)
      const codec = IpfsProviders._readVarint(reader)
      const hashCode = IpfsProviders._readVarint(reader)
      const hashLength = IpfsProviders._readVarint(reader)

      if (version !== 1 || (codec !== CODEC_RAW && codec !== CODEC_DAG_PB)) {
        return null
      }
      if (hashCode !== HASH_SHA2_256 || hashLength !== 0x20) {
        return null
      }
      const digest = bytes.subarray(reader.offset, reader.offset + hashLength)
      if (digest.length !== hashLength) {
        return null
      }
      return { version: 1, codec, digest: Buffer.from(digest) }
    } catch (_error) {
      return null
    }
  },

  verifyBlock: (decoded: IDecodedCid, block: Buffer): boolean => {
    return createHash('sha256').update(block).digest().equals(decoded.digest)
  },

  /**
   * Extracts the file content from a single-block dag-pb/UnixFS node.
   * Blocks with links (multi-block files) are unsupported and return null.
   */
  unwrapUnixFs: (block: Buffer): Buffer | null => {
    try {
      // PBNode: Data = field 1 (bytes), Links = field 2 (repeated)
      let nodeData: Buffer | null = null
      const nodeReader = { bytes: block, offset: 0 }
      while (nodeReader.offset < block.length) {
        const field = IpfsProviders._readField(nodeReader)
        if (!field) {
          return null
        }
        if (field.fieldNumber === 2) {
          return null
        }
        if (field.fieldNumber === 1 && field.bytes) {
          nodeData = field.bytes
        }
      }
      if (!nodeData) {
        return null
      }

      // UnixFS Data: Type = field 1 (varint), Data = field 2 (bytes)
      let content: Buffer | null = null
      const dataReader = { bytes: nodeData, offset: 0 }
      while (dataReader.offset < nodeData.length) {
        const field = IpfsProviders._readField(dataReader)
        if (!field) {
          return null
        }
        if (field.fieldNumber === 2 && field.bytes) {
          content = field.bytes
        }
      }
      return content
    } catch (_error) {
      return null
    }
  },

  /**
   * Translates the https multiaddr forms found in routing responses into a base URL.
   * Anything outside that subset (bitswap, plain http, dnsaddr) returns null.
   */
  parseMultiaddrToUrl: (addr: string): string | null => {
    const parts = addr.split('/').filter(Boolean)
    if (parts.length < 4) {
      return null
    }
    const [proto, host, transport, port, ...rest] = parts
    if (proto !== 'dns4' && proto !== 'dns6') {
      return null
    }
    if (transport !== 'tcp' || port !== '443') {
      return null
    }
    const scheme = rest.join('/')
    if (scheme !== 'https' && scheme !== 'tls/http') {
      return null
    }
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
      return null
    }
    return `https://${host}`
  },

  _base58Decode: (input: string): Buffer | null => {
    let value = 0n
    for (const char of input) {
      const index = BASE58_ALPHABET.indexOf(char)
      if (index === -1) {
        return null
      }
      value = value * 58n + BigInt(index)
    }
    let hex = value.toString(16)
    if (hex.length % 2) {
      hex = `0${hex}`
    }
    const decoded = Buffer.from(hex, 'hex')
    // leading "1" characters encode leading zero bytes
    let leadingZeros = 0
    for (const char of input) {
      if (char !== '1') break
      leadingZeros++
    }
    return Buffer.concat([Buffer.alloc(leadingZeros), decoded])
  },

  _base32Decode: (input: string): Buffer | null => {
    let bits = 0
    let value = 0
    const out: number[] = []
    for (const char of input) {
      const index = BASE32_ALPHABET.indexOf(char)
      if (index === -1) {
        return null
      }
      value = (value << 5) | index
      bits += 5
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff)
        bits -= 8
      }
    }
    return Buffer.from(out)
  },

  _readVarint: (reader: { bytes: Buffer; offset: number }): number => {
    let result = 0
    let shift = 0
    while (true) {
      if (reader.offset >= reader.bytes.length) {
        throw new Error('varint out of bounds')
      }
      const byte = reader.bytes[reader.offset++]
      result |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) {
        return result
      }
      shift += 7
      if (shift > 28) {
        throw new Error('varint too long')
      }
    }
  },

  _readField: (reader: {
    bytes: Buffer
    offset: number
  }): { fieldNumber: number; bytes?: Buffer; value?: number } | null => {
    const tag = IpfsProviders._readVarint(reader)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      return { fieldNumber, value: IpfsProviders._readVarint(reader) }
    }
    if (wireType === 2) {
      const length = IpfsProviders._readVarint(reader)
      const bytes = reader.bytes.subarray(reader.offset, reader.offset + length)
      if (bytes.length !== length) {
        return null
      }
      reader.offset += length
      return { fieldNumber, bytes: Buffer.from(bytes) }
    }
    if (wireType === 1) {
      reader.offset += 8
      return { fieldNumber }
    }
    if (wireType === 5) {
      reader.offset += 4
      return { fieldNumber }
    }
    return null
  },
}

export default IpfsProviders
