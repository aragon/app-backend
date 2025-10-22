import { type NetworksEnum } from '@types'
import logger from '@logger'
import Web3Helper from '@helpers/web3'

// eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
const llo = logger.logMeta.bind(null, { service: 'helpers:GaugeHelper' })

const GaugeHelper = {
  getTokenAddress: async (pluginAddress: string, network: NetworksEnum): Promise<string | null> => {
    try {
      const escrowAddress = await Web3Helper.getVotingEscrowAddress(pluginAddress, network)

      if (escrowAddress) {
        return await Web3Helper.getLockTokenAddress(escrowAddress, network)
      }

      return null
    } catch (error) {
      return null
    }
  },
}

export default GaugeHelper
