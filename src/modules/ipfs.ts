import logger from '@logger'
import { type PinataPin } from '@pinata/sdk'
import { type IMetadata } from '@types'
import { retry } from '@helpers/fetchRetry'
import PinataHelper from '@helpers/pinata'
import config from '@config'
import Web3Utils from '@helpers/web3Utils'

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
    opts?: { retries?: number; delay?: number; timeout?: number },
  ): Promise<IMetadata | null> => {
    const cid = ipfsUrl?.replace('ipfs://', '')

    if (!IPFSModule._isValidCIDv0(cid) && !IPFSModule._isValidCIDv1(cid)) {
      return null
    }

    // try with gateway
    let data = await PinataHelper.getData(cid)

    if (!data) {
      // try from any source
      data = await IPFSModule._fetchMetadata(cid, opts)
    }

    if (data?.avatar?.path) {
      data.avatar = data.avatar.path
    }

    return data
  },

  _fetchMetadata: async (cid: string, opts?: { retries?: number; delay?: number; timeout?: number }) => {
    try {
      const url = `https://ipfs.io/ipfs/${cid}`

      return await retry(
        async () => {
          const controller = new AbortController()
          const timeout = opts?.timeout || config.IPFS.METADATA_FETCH_TIMEOUT
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          try {
            const response = await fetch(url, {
              signal: controller.signal,
            })

            if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`)
            }

            const data = await response.json()
            return Web3Utils.parseDaoMetadata(data)
          } finally {
            clearTimeout(timeoutId)
          }
        },
        {
          retries: opts?.retries || config.IPFS.METADATA_FETCH_RETRY,
          delay: opts?.delay || config.IPFS.METADATA_FETCH_DELAY,
          timeout: opts?.timeout || config.IPFS.METADATA_FETCH_TIMEOUT,
        },
      )
    } catch (error) {
      logger.error('Failed to fetch metadata from IPFS', llo({ cid, error }))
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

  parseCapitalDistributorMetadata: (metadata: any): {
    // Campaign metadata (basic)
    name: string | null
    description: string | null
    links: string[]
    // Plugin metadata (Capital Distributor specific)
    blockedCountries: string[]
    termsConditionsUrl: string | null
    enableOfacCheck: boolean
  } => {
    const parsedMetadata = {
      // Campaign metadata
      name: null as string | null,
      description: null as string | null,
      links: [] as string[],
      // Plugin metadata
      blockedCountries: [] as string[],
      termsConditionsUrl: null as string | null,
      enableOfacCheck: false,
    }

    if (!metadata) {
      return parsedMetadata
    }

    // Parse campaign metadata (basic)
    if (metadata.name && typeof metadata.name === 'string') {
      parsedMetadata.name = metadata.name
    }

    if (metadata.description && typeof metadata.description === 'string') {
      parsedMetadata.description = metadata.description
    }

    if (metadata.links && Array.isArray(metadata.links)) {
      parsedMetadata.links = metadata.links.map((link: any) => {
        if (typeof link === 'string') {
          return link
        }
        if (link && typeof link === 'object' && link.url) {
          return link.url
        }
        return null
      }).filter(Boolean)
    }

    // Parse plugin metadata (Capital Distributor specific)
    if (metadata.blockedCountries && Array.isArray(metadata.blockedCountries)) {
      parsedMetadata.blockedCountries = metadata.blockedCountries.filter(
        (country: any) => typeof country === 'string'
      )
    }

    if (metadata.termsConditionsUrl && typeof metadata.termsConditionsUrl === 'string') {
      parsedMetadata.termsConditionsUrl = metadata.termsConditionsUrl
    }

    if (typeof metadata.enableOfacCheck === 'boolean') {
      parsedMetadata.enableOfacCheck = metadata.enableOfacCheck
    }

    logger.debug('Capital Distributor metadata parsed', llo({
      hasCampaignName: !!parsedMetadata.name,
      hasCampaignDescription: !!parsedMetadata.description,
      campaignLinksCount: parsedMetadata.links.length,
      blockedCountriesCount: parsedMetadata.blockedCountries.length,
      hasTermsConditions: !!parsedMetadata.termsConditionsUrl,
      enableOfacCheck: parsedMetadata.enableOfacCheck,
    }))

    return parsedMetadata
  },
}

export default IPFSModule
