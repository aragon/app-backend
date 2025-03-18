import { type HexAddress, type NetworksEnum } from '@types'
import { Contract } from 'ethers'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'helpers:GovernanceErc20Helper' })

const GovernanceErc20Helper = {
  async getPastVotes(
    memberAddress: HexAddress,
    tokenAddress: HexAddress,
    blockNumber: number,
    blockTimestamp: number,
    network: NetworksEnum,
  ): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      const adjustedBlockNumber = await Web3Helper.getChainAdjustedBlockNumber(blockNumber, network)
      const pastVotes = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.getPastVotes(memberAddress, adjustedBlockNumber),
        ),
      )
      if (pastVotes > 0n) {
        return BigInt(pastVotes || 0)?.toString()
      }
    } catch (error) {
      logger.warn(
        'Error getting past votes - blockNumber',
        llo({ memberAddress, tokenAddress, blockNumber, blockTimestamp, network, error }),
      )
    }

    try {
      const pastVotes = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.getPastVotes(memberAddress, blockTimestamp),
        ),
      )
      return BigInt(pastVotes || 0)?.toString()
    } catch (error) {
      logger.warn(
        'Error getting past votes - blockTimestamp',
        llo({ memberAddress, tokenAddress, blockNumber, blockTimestamp, network, error }),
      )
    }

    return '0'
  },

  async getVotes(memberAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getVotes(memberAddress)),
      )
    } catch (error) {
      logger.error('Error getting votes', llo({ memberAddress, tokenAddress, network, error }))
      return 0n
    }
  },

  async getPastTotalSupply(blockNumber: number, tokenAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    const adjustedBlockNumber = await Web3Helper.getChainAdjustedBlockNumber(blockNumber, network)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getPastTotalSupply(adjustedBlockNumber)),
      )
    } catch (error) {
      logger.error('Error getting pastTotalSupply', llo({ blockNumber, tokenAddress, network, error }))
      return '0'
    }
  },

  async getDelegates(memberAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum): Promise<any> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, GovernanceERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.delegates(memberAddress)),
      )
    } catch (e) {
      logger.error('Error getting delegate', llo({ memberAddress, tokenAddress, network, error: e }))
      return null
    }
  },
}

export default GovernanceErc20Helper
