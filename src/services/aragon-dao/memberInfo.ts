import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { type IMemberTokenInfo, type NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'

export const MemberInfo = {
  getByTokenAddress: async (
    userAddress: string,
    tokenAddress: string,
    network: NetworksEnum,
  ): Promise<IMemberTokenInfo> => {
    const response = {
      balance: '0',
      votingPower: '0',
      currentDelegate: null,
    }

    try {
      const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
      if (!token) {
        return response
      }

      response.balance = (await Web3Helper.getERC20Balance(userAddress, tokenAddress, network)).toString()
      response.votingPower = (await GovernanceErc20Helper.getVotes(userAddress, tokenAddress, network)).toString()

      if (token.hasDelegate) {
        response.currentDelegate = await GovernanceErc20Helper.getDelegates(userAddress, tokenAddress, network)
      }

      return response
    } catch (e) {
      return response
    }
  },
}
