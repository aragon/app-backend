import utils from '@helpers/utils'
import logger from '@logger'
import { type NetworksEnum } from '@types'
import { ethers } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:AlchemyHelper' })

const AlchemyHelper = {
  alchemyCrazyBalanceOnError: (
    address: string,
    tokenAddress: string,
    network: NetworksEnum,
    amount: any,
    decimals: number,
  ) => {
    if (typeof amount === 'string' && !amount?.includes('0x')) {
      logger.error('Error alchemyCrazyBalance wrong format', llo({ address, tokenAddress, network, amount, decimals }))
    }
  },

  handleAlchemyCrazyBalance: (amount: number | string, decimals: number = 0, tx?: any): string => {
    try {
      if (typeof amount === 'string' && amount.includes('0x')) {
        return ethers.formatUnits(amount, decimals)
      } else if (utils.isScientificNumber(amount)) {
        if (Number(amount) < 1 && Number(amount) > -1) {
          return Number(amount).toFixed(decimals)
        } else {
          return ethers.formatUnits(Number(amount).toLocaleString('fullwide', { useGrouping: false }), decimals)
        }
      } else if (!isNaN(Number(amount))) {
        return amount.toString()
      } else {
        logger.error('Error not handled amount format', llo({ amount, decimals, tx }))
        return '0'
      }
    } catch (error) {
      logger.error('Error in conversion', llo({ error, amount, decimals, tx }))
      return '0' // Return '0' or handle the error as appropriate
    }
  },
}

export default AlchemyHelper
