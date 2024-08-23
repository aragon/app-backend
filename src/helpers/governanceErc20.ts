import { type HexAddress, type NetworksEnum } from '@types'
import { Contract } from 'ethers'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

const llo = logger.logMeta.bind(null, { service: 'helpers:GovernanceErc20Helper' })

const GovernanceErc20Helper = {
  async getPastVotes(
    memberAddress: HexAddress,
    tokenAddress: HexAddress,
    blockNumber: number,
    network: NetworksEnum,
  ): Promise<HexAddress | false> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () =>
          contract.getPastVotes(memberAddress, blockNumber),
        ),
      )
    } catch (error) {
      logger.warn('Error getting past votes', llo({ memberAddress, tokenAddress, blockNumber, network }))
      return false
    }
  },

  async getVotes(
    memberAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<HexAddress | false> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getVotes(memberAddress)),
      )
    } catch (error) {
      logger.warn('Error getting votes', llo({ memberAddress, tokenAddress, network }))
      return false
    }
  },

  async getPastTotalSupply(
    blockNumber: number,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<HexAddress | false> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getPastTotalSupply(blockNumber)),
      )
    } catch (error) {
      logger.warn('Error getting pastTotalSupply', llo({ blockNumber, tokenAddress, network }))
      return false
    }
  },

  async getDelegates(
    memberAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<HexAddress | false> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.delegates(memberAddress)),
      )
    } catch (error) {
      logger.warn('Error getting delegates', llo({ memberAddress, tokenAddress, network }))
      return false
    }
  },
}

export default GovernanceErc20Helper
