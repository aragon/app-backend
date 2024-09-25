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
    blockTimestamp: number,
    network: NetworksEnum,
  ): Promise<string> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(
          async () => contract.getPastVotes(memberAddress, blockNumber),
          { maxRetries: 3, forceRetry: true },
        ),
      )
    } catch (error) {
      logger.error(
        'Error getting past votes - blockNumber',
        llo({ memberAddress, tokenAddress, blockNumber, network, error }),
      )
    }

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network)!.schedule(
          async () => contract.getPastVotes(memberAddress, blockTimestamp),
          { maxRetries: 3, forceRetry: true },
        ),
      )
    } catch (error) {
      logger.error(
        'Error getting past votes - blockTimestamp',
        llo({ memberAddress, tokenAddress, blockNumber, network, error }),
      )
    }

    return '0'
  },

  async getVotes(memberAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(
        async () => BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getVotes(memberAddress)),
        { maxRetries: 3, forceRetry: true },
      )
    } catch (error) {
      logger.error('Error getting votes', llo({ memberAddress, tokenAddress, network, error }))
      return '0'
    }
  },

  async getPastTotalSupply(blockNumber: number, tokenAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getProvider(network)!
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(
        async () =>
          BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.getPastTotalSupply(blockNumber)),
        { maxRetries: 3, forceRetry: true },
      )
    } catch (error) {
      logger.error('Error getting pastTotalSupply', llo({ blockNumber, tokenAddress, network, error }))
      return '0'
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
      return await retryRequest(
        async () => BottleneckModule.getNodeLimiter(network)!.schedule(async () => contract.delegates(memberAddress)),
        { maxRetries: 3, forceRetry: true },
      )
    } catch (error) {
      logger.error('Error getting delegates', llo({ memberAddress, tokenAddress, network, error }))
      return '0'
    }
  },
}

export default GovernanceErc20Helper
