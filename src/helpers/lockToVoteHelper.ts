import ProviderModule from '@modules/provider'
import { type HexAddress, type NetworksEnum } from '@types'
import { Contract, Interface } from 'ethers'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

const LockToVoteHelper = {
  async getVotingToken(network: NetworksEnum, pluginAddress: HexAddress) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function token() view returns (address)']

    try {
      const lockManagerAddress = await LockToVoteHelper.getLockManager(network, pluginAddress)
      if (!lockManagerAddress) {
        return null
      }
      const managerContract = new Contract(lockManagerAddress, abi, provider)

      return await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () => managerContract.token()),
      )
    } catch (error) {
      return null
    }
  },

  async getLockManager(network: NetworksEnum, pluginAddress: HexAddress) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function lockManager() view returns (address)']
    const contract = new Contract(pluginAddress, abi, provider)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () => contract.lockManager()),
      )
    } catch (error) {
      return null
    }
  },

  async getUserLockedBalance(network: NetworksEnum, lockManagerAddress: HexAddress, userAddress: HexAddress) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function getLockedBalance(address) view returns (uint256)']
    const contract = new Contract(lockManagerAddress, abi, provider)

    try {
      const balance = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () => contract.getLockedBalance(userAddress)),
      )
      return BigInt(balance || 0).toString()
    } catch (error) {
      return null
    }
  },

  async getCurrentTotalSupply(network: NetworksEnum, pluginAddress: HexAddress, blockNumber: number) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function currentTokenSupply() view returns (uint256)']
    const iFace = new Interface(abi)
    const data = iFace.encodeFunctionData('currentTokenSupply', [])
    const params = { to: pluginAddress, data }
    const blockTag = `0x${BigInt(blockNumber).toString(16)}`
    try {
      const supply = await provider.call(params, blockTag)
      return BigInt(supply).toString()
    } catch (error) {
      return '0'
    }
  },

  async getRequiredVotingPowerForProposal(
    conditionAddress: HexAddress,
    userAddress: HexAddress,
    network: NetworksEnum,
  ) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function getRequiredLockAmount(address) view returns (uint256)']
    const iFace = new Interface(abi)
    const data = iFace.encodeFunctionData('getRequiredLockAmount', [userAddress])
    const params = { to: conditionAddress, data }
    try {
      const power = await provider.call(params)
      return BigInt(power).toString()
    } catch (error) {
      return undefined
    }
  },
}

export default LockToVoteHelper
