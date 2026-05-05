import config from '@config'
import { retry } from '@helpers/fetchRetry'
import PinataHelper from '@helpers/pinata'
import logger from '@logger'
import { type PinataPin } from '@pinata/sdk'
import { type IMetadata } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helpers:IPFSModule' })

const IPFSModule = {
  pinList: async (cid?: string): Promise<PinataPin[]> => {
    return await PinataHelper.pinList(cid)
  },

  unPinMetadata: async (cid: string): Promise<boolean> => {
    return await PinataHelper.unPin(cid)
  },

  pinataMetadata: async (metadata: IMetadata): Promise<string | null> => {
    return await PinataHelper.uploadAndPinMetadata(metadata)
  },

  fetchMetadata: async (
    ipfsUrl: string,
    opts?: {
      retries?: number
      delay?: number
      timeout?: number
      onFetchFailed?: (metadataUri: string) => Promise<void>
    },
  ): Promise<IMetadata | null> => {
    const cid = ipfsUrl?.replace('ipfs://', '')

    if (!IPFSModule._isValidCIDv0(cid) && !IPFSModule._isValidCIDv1(cid)) {
      return null
    }

    const totalTimeout = opts?.timeout ?? config.IPFS.METADATA_FETCH_TOTAL_TIMEOUT
    const startTime = Date.now()

    const getRemainingTimeout = () => {
      const remaining = totalTimeout - (Date.now() - startTime)
      return remaining > 0 ? remaining : 0
    }

    // try with Pinata gateway, respecting the total timeout budget
    const pinataTimeout = Math.min(getRemainingTimeout(), opts?.timeout ?? config.IPFS.METADATA_FETCH_TIMEOUT)
    let data: any = null
    if (pinataTimeout > 0) {
      data = await PinataHelper.getData(cid, pinataTimeout)
    }

    // fallback to public gateway
    if (!data && getRemainingTimeout() > 0) {
      data = await IPFSModule._fetchMetadata(cid, {
        retries: opts?.retries,
        delay: opts?.delay,
        timeout: getRemainingTimeout(),
      })
    }

    // fallback to secondary public gateway
    if (!data && getRemainingTimeout() > 0) {
      data = await IPFSModule._fetchMetadataDweb(cid, {
        retries: opts?.retries,
        delay: opts?.delay,
        timeout: getRemainingTimeout(),
      })
    }

    // fallback to Pinata's public gateway (unauthenticated, serves content not pinned by our org)
    if (!data && getRemainingTimeout() > 0) {
      data = await IPFSModule._fetchMetadataPinataPublic(cid, {
        retries: opts?.retries,
        delay: opts?.delay,
        timeout: getRemainingTimeout(),
      })
    }

    if (data?.avatar?.path) {
      data.avatar = data.avatar.path
    }

    // Call onFetchFailed callback if fetch failed and callback is provided
    if (!data && opts?.onFetchFailed) {
      try {
        await opts.onFetchFailed(ipfsUrl)
      } catch (error) {
        logger.error('Error in onFetchFailed callback', llo({ ipfsUrl, error }))
      }
    }

    return data
  },

  _fetchMetadata: async (cid: string, opts?: { retries?: number; delay?: number; timeout?: number }) => {
    return IPFSModule._fetchFromGateway(cid, config.IPFS.PUBLIC_GATEWAY_URI, opts)
  },

  _fetchMetadataDweb: async (cid: string, opts?: { retries?: number; delay?: number; timeout?: number }) => {
    return IPFSModule._fetchFromGateway(cid, config.IPFS.DWEB_GATEWAY_URI, opts)
  },

  _fetchMetadataPinataPublic: async (cid: string, opts?: { retries?: number; delay?: number; timeout?: number }) => {
    return IPFSModule._fetchFromGateway(cid, config.IPFS.PINATA_PUBLIC_GATEWAY_URI, opts)
  },

  _fetchFromGateway: async (
    cid: string,
    gatewayUri: string,
    opts?: { retries?: number; delay?: number; timeout?: number },
  ) => {
    try {
      const url = `${gatewayUri}/${cid}`

      return await retry(
        async () => {
          const controller = new AbortController()
          const timeout = opts?.timeout ?? config.IPFS.METADATA_FETCH_TIMEOUT
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          try {
            const response = await fetch(url, {
              signal: controller.signal,
            })

            if (!response.ok) {
              const isPermanent4xx =
                response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429
              const isGatewayDown = response.status === 502 || response.status === 503 || response.status === 504

              if (isPermanent4xx || isGatewayDown) {
                return null
              }
              throw new Error(`HTTP error! Status: ${response.status}`)
            }

            return await response.json()
          } finally {
            clearTimeout(timeoutId)
          }
        },
        {
          retries: opts?.retries ?? config.IPFS.METADATA_FETCH_RETRY,
          delay: opts?.delay ?? config.IPFS.METADATA_FETCH_DELAY,
          timeout: opts?.timeout ?? config.IPFS.METADATA_FETCH_TIMEOUT,
        },
      )
    } catch (error) {
      logger.error(`Failed to fetch metadata from ${gatewayUri}`, llo({ cid, error }))
      return null
    }
  },

  isValidIpfsUrl: (url: string) => {
    if (!url || typeof url !== 'string') {
      return false
    }

    // Extract the CID from the IPFS URL
    const potentialCid = url.replace(/^ipfs:\/\//, '')

    // Check if it's a valid CIDv0 or CIDv1
    return IPFSModule._isValidCIDv0(potentialCid) || IPFSModule._isValidCIDv1(potentialCid)
  },

  _isValidCIDv0: (cid: string) => {
    // CIDv0 are base58btc encoded and start with 'Qm'
    const cidv0Regex = /^Qm[a-zA-Z0-9]{44}$/
    return cidv0Regex.test(cid)
  },

  _isValidCIDv1: (cid: string) => {
    // CIDv1 can be encoded in base32 or other bases, and doesn't have a fixed start
    // This regex is for base32 encoded CIDv1
    const cidv1Regex = /^b[a-z2-7]{58}$/
    return cidv1Regex.test(cid)
  },
}

export default IPFSModule
