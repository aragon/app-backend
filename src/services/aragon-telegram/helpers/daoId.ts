import { type DAO_ENS, type HexAddress, NetworksEnum } from '@types'
import { getAddress } from 'ethers'

export interface IParsedDaoRef {
  network: NetworksEnum
  daoAddress: HexAddress
}

export interface IParsedEnsRef {
  network: NetworksEnum
  ens: DAO_ENS
}

const NETWORK_VALUES = new Set<string>(Object.values(NetworksEnum))
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const ADDRESS_CAPTURE_RE = /(0x[a-fA-F0-9]{40})/
// Any URL path with `/dao/<network>/<address>` (any host, any trailing path/query).
const URL_DAO_PATH_RE = /\/dao\/([A-Za-z][A-Za-z0-9-]*?)\/(0x[a-fA-F0-9]{40})(?:[/?#]|$)/i
// The app's default mainnet URL puts the DAO's ENS name where the address goes.
const URL_ENS_PATH_RE = /\/dao\/([A-Za-z][A-Za-z0-9-]*?)\/([a-z0-9][a-z0-9-]*\.dao\.eth)(?:[/?#]|$)/i
const ENS_RE = /^[a-z0-9][a-z0-9-]*\.dao\.eth$/i

/**
 * Parse and format DAO references across the input shapes the bot accepts:
 *   - URL form (full or sub-pathed)
 *   - `<network> <address>` (space-separated)
 *   - `<network>-<0xaddr>` (kebab)
 *   - `<networkCamelCase>-<0xaddr>` (camelCase)
 *
 * All outputs are normalised to the canonical kebab `<network>` from `NetworksEnum`.
 */
export class DaoIdParser {
  /** Parse any supported input shape; return null if unrecognised. */
  static parse(raw: string): IParsedDaoRef | null {
    if (!raw) return null
    const input = raw.trim()
    if (!input) return null

    // 1) URL form
    if (input.includes('/dao/')) {
      const m = URL_DAO_PATH_RE.exec(input)
      if (m) {
        const network = DaoIdParser.normalizeNetwork(m[1])
        const address = DaoIdParser.normalizeAddress(m[2])
        if (network && address) {
          return { network, daoAddress: address }
        }
      }
    }

    // 2) Space-separated `<network> <address>`
    if (/\s/.test(input)) {
      const parts = input.split(/\s+/).filter(Boolean)
      if (parts.length === 2) {
        const network = DaoIdParser.normalizeNetwork(parts[0])
        const address = DaoIdParser.normalizeAddress(parts[1])
        if (network && address) {
          return { network, daoAddress: address }
        }
      }
    }

    // 3) Single arg — locate the `0x…` address, take everything before as network
    const addrMatch = ADDRESS_CAPTURE_RE.exec(input)
    if (addrMatch) {
      const address = DaoIdParser.normalizeAddress(addrMatch[1])
      const networkPart = input.slice(0, addrMatch.index).replace(/[-/\s]+$/, '')
      if (networkPart && address) {
        const network = DaoIdParser.normalizeNetwork(networkPart)
        if (network) return { network, daoAddress: address }
      }
    }

    return null
  }

  /**
   * Parse an ENS reference — either a bare `name.dao.eth` (ethereum mainnet
   * only) or the app's default URL form `/dao/<network>/<name.dao.eth>`.
   * Returns null when the input isn't an ENS shape.
   */
  static parseEns(raw: string): IParsedEnsRef | null {
    if (!raw) return null
    const input = raw.trim()
    if (!input) return null

    if (input.includes('/dao/')) {
      const m = URL_ENS_PATH_RE.exec(input)
      if (m) {
        const network = DaoIdParser.normalizeNetwork(m[1])
        if (network) return { network, ens: m[2].toLowerCase() as DAO_ENS }
      }
      return null
    }

    if (ENS_RE.test(input)) {
      return { network: NetworksEnum.ethereumMainnet, ens: input.toLowerCase() as DAO_ENS }
    }

    return null
  }

  /** Convert any casing of a network name (camel or kebab) to its enum value. */
  private static normalizeNetwork(raw: string): NetworksEnum | null {
    const candidate = DaoIdParser.toKebab(raw.trim())
    return NETWORK_VALUES.has(candidate) ? (candidate as NetworksEnum) : null
  }

  private static normalizeAddress(raw: string): HexAddress | null {
    if (!ADDRESS_RE.test(raw)) return null
    try {
      return getAddress(raw) as HexAddress
    } catch {
      return null
    }
  }

  private static toKebab(s: string): string {
    return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  }
}
