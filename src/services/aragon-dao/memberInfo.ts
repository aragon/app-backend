import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { type NetworksEnum } from '@types'
const MemberInfo = {
  getByTokenAddress: async (userAddress: string, tokenAddress: string, network: NetworksEnum) => {
    const userBalance = await Web3Helper.getERC20Balance(userAddress, tokenAddress, network)
    const userVotingPower = await GovernanceErc20Helper.getVotes(userAddress, tokenAddress, network)

    return {
      balance: userBalance.toString(),
      votingPower: userVotingPower.toString(),
    }
  },
}

export default MemberInfo
