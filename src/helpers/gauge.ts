import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import { ethers } from 'ethers'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

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

  getIVotesAdapterAddress: async (pluginAddress: string, network: NetworksEnum): Promise<string | null> => {
    try {
      const abi = ['function ivotesAdapter() view returns (address)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new ethers.Contract(pluginAddress, abi, provider)

      const iVotesAdapterAddress = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.ivotesAdapter(),
        ),
      )

      if (iVotesAdapterAddress === ethers.ZeroAddress) {
        return null
      }

      return iVotesAdapterAddress
    } catch (error) {
      return null
    }
  },

  getEnableUpdateVotingPowerHookFlag: async (pluginAddress: string, network: NetworksEnum): Promise<boolean> => {
    try {
      const abi = ['function enableUpdateVotingPowerHook() view returns (bool)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new ethers.Contract(pluginAddress, abi, provider)

      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.enableUpdateVotingPowerHook(),
        ),
      )
    } catch (error) {
      return false
    }
  },
}

export default GaugeHelper
