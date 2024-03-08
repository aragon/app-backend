import logger from '@logger'
import { type IDaoMetadata, type NetworksEnum } from '@types'
import { aragonGateway } from '@helpers/aragonGateway'
import { retry } from '@helpers/fetchRetry'
import config from '@config'
import axios from 'axios'

const llo = logger.logMeta.bind(null, { service: 'helpers:IPFSHelper' })

const IPFSHelper = {
  fetchMetadata: async(
    ipfsUrl: string,
    network: NetworksEnum,
  ): Promise<IDaoMetadata | null> => {
    // Extract the CID from the IPFS URL
    const cid = ipfsUrl?.replace('ipfs://', '')

    if (IPFSHelper._isValidCIDv0(cid)) {
      return await IPFSHelper.fetchMetadataViaGateway(cid, network)
    } else if (IPFSHelper._isValidCIDv1(cid)) {
      return await IPFSHelper.fetchMetadataViaRequest(cid)
    } else {
      logger.warn('Invalid IPFS URL or CID version', llo({ ipfsUrl }))
      return null
    }
  },

  fetchMetadataViaRequest: async(cid: string) => {
    try {
      const url = `https://ipfs.io/ipfs/${cid}`
      const response = await axios.get(url)

      return IPFSHelper._parseMetadata(response.data)
    } catch (error) {
      logger.error('Failed to fetch metadata from IPFS', llo({ cid, error }))
      return null
    }
  },

  fetchMetadataViaGateway: async(
    cid: string,
    network: NetworksEnum,
  ): Promise<IDaoMetadata | null> => {
    try {
      const ipfsClient = aragonGateway.getIpfsClient(network)
      const bytes = await retry(
        async() => {
          const controller = new AbortController()
          return await ipfsClient.cat(cid, { signal: controller.signal })
        },
        {
          retries: config.IPFS.METADATA_FETCH_RETRY,
          delay: config.IPFS.METADATA_FETCH_DELAY,
        },
      )

      const text = new TextDecoder().decode(bytes)
      const metadata: IDaoMetadata = JSON.parse(text)

      return IPFSHelper._parseMetadata(metadata)
    } catch (error) {
      logger.warn(
        'Cannot fetch or decode metadata',
        llo({ cid, network, error }),
      )
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
    return (
      IPFSHelper._isValidCIDv0(potentialCid) ||
      IPFSHelper._isValidCIDv1(potentialCid)
    )
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

  _parseMetadata(metadata: IDaoMetadata): IDaoMetadata {
    if (
      !metadata.avatar ||
      (metadata.avatar && typeof metadata.avatar !== 'string')
    ) {
      metadata.avatar = null
    }

    if (
      !metadata.description ||
      (metadata.description && typeof metadata.description !== 'string')
    ) {
      metadata.description = null
    }

    if (
      !metadata.name ||
      (metadata.name && typeof metadata.name !== 'string')
    ) {
      metadata.name = null
    }

    if (!metadata?.links) {
      metadata.links = []
    }

    return metadata
  },
}

export default IPFSHelper
