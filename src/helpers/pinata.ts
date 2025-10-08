import Pinata, { type PinataPin, type PinataPinOptions } from '@pinata/sdk'
import config from '@config'
import logger from '@logger'
import { type IMetadata } from '@types'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'helpers:PinataHelper' })

const PinataHelper = {
  pinata: new Pinata({ pinataJWTKey: config.PINATA.JWT }),

  async getData(cid: string) {
    try {
      const response = await fetch(`${config.PINATA.GATEWAY_URI}/${cid}`, {
        method: 'GET',
      })

      const data = await response.json()
      return typeof data === 'string' ? JSON.parse(data) : data
    } catch (error: any) {
      const msg = typeof error?.message === 'string' ? error.message : ''
      if (!msg.includes('is not valid JSON')) {
        logger.error('Pinata failed to fetch data', llo({ cid, error }))
      }
      return null
    }
  },

  async uploadAndPinMetadata(metadata: IMetadata): Promise<string | null> {
    try {
      const body = {
        name: metadata.name || null,
        description: metadata.description || null,
        avatar: metadata.avatar || null,
        links: metadata.links || [],
        processKey: metadata.processKey || null,
        stageNames: metadata.stageNames || [],
      }

      const options: PinataPinOptions = {
        pinataMetadata: {
          name: metadata.name || utils.generateRandomName(10),
        },
        pinataOptions: {
          cidVersion: 1,
        },
      }

      const data = await this.pinata.pinJSONToIPFS(body, options)
      return data.IpfsHash
    } catch (error) {
      logger.error('Failed to upload and pin metadata', llo({ error, metadata }))
      return null
    }
  },

  async unPin(hashToUnpin: string): Promise<boolean> {
    try {
      await this.pinata.unpin(hashToUnpin)
      logger.verbose('Successfully unpinned', llo({ hashToUnpin }))
      return true
    } catch (error) {
      logger.error('Failed to unpin', llo({ hashToUnpin, error }))
      return false
    }
  },

  async pinList(cid?: string): Promise<PinataPin[]> {
    try {
      const params: any = {}
      if (cid) {
        params.hashContains = cid
      }

      const { rows } = await this.pinata.pinList(params)

      return rows
    } catch (error) {
      logger.error('Failed to fetch pinList', llo({ cid, error }))
      return []
    }
  },
}

export default PinataHelper
