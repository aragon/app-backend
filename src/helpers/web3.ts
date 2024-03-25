import { type HexAddress } from '@types'
import { getAddress } from 'ethers'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Utils' })

const Web3Utils = {
  parseAddress(address: HexAddress, extraLog?: any): HexAddress | null {
    try {
      return getAddress(address) as HexAddress
    } catch (error) {
      logger.error('Error checksum dao address', llo({ address, error, extraLog }))
      return null
    }
  },
}

export default Web3Utils
