import logger from '@logger'
import { type PinataPin } from '@pinata/sdk'
import { type IDaoMetadata } from '@types'
import { retry } from '@helpers/fetchRetry'
import PinataHelper from '@helpers/pinata'
import config from '@config'
import axios from 'axios'

const llo = logger.logMeta.bind(null, { service: 'helpers:IPFSModule' })

const IPFSModule = {
  pinList: async (cid?: string): Promise<PinataPin[]> => {
    return await PinataHelper.pinList(cid)
  },

  unPinMetadata: async (cid: string): Promise<boolean> => {
    return await PinataHelper.unPin(cid)
  },

  pinataMetadata: async (metadata: IDaoMetadata): Promise<string | null> => {
    return await PinataHelper.uploadAndPinMetadata(metadata)
  },

  fetchMetadata: async (
    ipfsUrl: string,
    opts?: { retries?: number; delay?: number; timeout?: number },
  ): Promise<IDaoMetadata | null> => {
    const cid = ipfsUrl?.replace('ipfs://', '')

    if (!IPFSModule._isValidCIDv0(cid) && !IPFSModule._isValidCIDv1(cid)) {
      return null
    }

    return await IPFSModule._fetchMetadata(cid, opts)
  },

  _fetchMetadata: async (cid: string, opts?: { retries?: number; delay?: number; timeout?: number }) => {
    try {
      const url = `https://ipfs.io/ipfs/${cid}`

      return await retry(
        async () => {
          const response = await axios.get(url)
          return IPFSModule._parseDaoMetadata(response.data)
        },
        {
          retries: opts?.retries || config.IPFS.METADATA_FETCH_RETRY,
          delay: opts?.delay || config.IPFS.METADATA_FETCH_DELAY,
          timeout: opts?.timeout || config.IPFS.METADATA_FETCH_DELAY,
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

  _parseDaoMetadata(metadata: IDaoMetadata): IDaoMetadata {
    if (!metadata.avatar || (metadata.avatar && typeof metadata.avatar !== 'string')) {
      metadata.avatar = null
    }

    if (!metadata.description || (metadata.description && typeof metadata.description !== 'string')) {
      metadata.description = null
    }

    if (!metadata.name || (metadata.name && typeof metadata.name !== 'string')) {
      metadata.name = null
    }

    if (!metadata?.links) {
      metadata.links = []
    }

    return metadata
  },
}

export default IPFSModule
