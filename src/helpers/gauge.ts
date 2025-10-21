import { type NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

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
