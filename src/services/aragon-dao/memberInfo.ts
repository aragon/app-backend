import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { IPluginInterfaceType, type NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'

export const MemberInfo = {
  getByTokenAddress: async (
    userAddress: string,
    pluginAddress: string | null,
    tokenAddress: string | null,
    network: NetworksEnum,
  ): Promise<{
    balance: string | null
    votingPower: string | null
    currentDelegate: string | null
  }> => {
    const response = {
      balance: null,
      votingPower: null,
      currentDelegate: null,
    }

    try {
      if (!tokenAddress && !pluginAddress) {
        return response
      }

      if (pluginAddress) {
        const plugin = await Models.Plugin.findByAddress(pluginAddress, network)
        if (!plugin || plugin.interfaceType !== IPluginInterfaceType.tokenVoting) {
          return response
        }
        tokenAddress = plugin.tokenAddress
      }

      const token = await ProxyToken.saveAndGetToken(tokenAddress!, network)
      if (!token) {
        return response
      }

      const balance = (await Web3Helper.getERC20Balance(userAddress, tokenAddress!, network)).toString()
      const votingPower = (await GovernanceErc20Helper.getVotes(userAddress, tokenAddress!, network)).toString()

      Object.assign(response, { balance, votingPower })

      if (token.hasDelegate) {
        response.currentDelegate = await GovernanceErc20Helper.getDelegates(userAddress, tokenAddress!, network)
      }

      return response
    } catch (e) {
      return response
    }
  },
}
