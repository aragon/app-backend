import config from '@config'
import { HypersyncClient } from '@envio-dev/hypersync-client'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'modules:HyperSyncClient' })

// One client per network, kept for the process lifetime. The client owns its own
// connection pool, retry and rate-limit state, so rebuilding it per crawl would
// throw that state away on every tick.
const clients = new Map<NetworksEnum, HypersyncClient>()

const HyperSyncClientModule = {
  /**
   * Endpoint for a network, e.g. https://1.hypersync.xyz for ethereum-mainnet.
   * Envio also publishes named hosts (eth.hypersync.xyz); the chain-id form covers
   * every network from one template and matches ProviderModule's chain map.
   */
  getUrl(network: NetworksEnum): string {
    const chainId = ProviderModule.getChainId(network)
    if (!chainId) throw new Error(`No chain id mapped for network: ${network}`)
    return config.HYPERSYNC.URL_TEMPLATE.replace('{chainId}', String(chainId))
  },

  /**
   * Whether we can crawl this network over HyperSync at all: Envio has to serve it
   * and we need a token, mandatory since November 2025.
   */
  isSupported(network: NetworksEnum): boolean {
    if (!config.HYPERSYNC.API_TOKEN) return false
    return config.HYPERSYNC.NETWORKS.includes(network)
  },

  getClient(network: NetworksEnum): HypersyncClient {
    const existing = clients.get(network)
    if (existing) return existing

    if (!config.HYPERSYNC.API_TOKEN) {
      throw new Error('HyperSync API token is missing (set ENVIO_API_TOKEN)')
    }

    const url = HyperSyncClientModule.getUrl(network)
    const client = new HypersyncClient({
      url,
      apiToken: config.HYPERSYNC.API_TOKEN,
      maxNumRetries: config.HYPERSYNC.MAX_RETRIES,
      // Addresses come back checksummed, so they match what we store without a
      // per-log getAddress() call on the hot path.
      enableChecksumAddresses: true,
    })

    clients.set(network, client)
    logger.verbose('HyperSync client created', llo({ network, url }))
    return client
  },

  /** Drop the cached clients. Only used by tests. */
  reset(): void {
    clients.clear()
  },
}

export default HyperSyncClientModule
export { HyperSyncClientModule }
