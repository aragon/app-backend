import { type HexAddress, IClockMode, type NetworksEnum } from '@types'
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
      const clockMode = await GovernanceErc20Helper.getClockMode(tokenAddress, network)

      const modeToUse =
        clockMode === IClockMode.BlockNumber
          ? await Web3Helper.getChainAdjustedBlockNumber(blockNumber, network)
          : blockTimestamp
      const pastVotes = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getPastVotes(memberAddress, modeToUse)),
      )
      if (pastVotes > 0n) {
        return BigInt(pastVotes || 0)?.toString()
      }
    } catch (error) {
      logger.warn(
        'Error getting past votes',
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

  async getClockMode(tokenAddress: HexAddress, network: NetworksEnum) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(tokenAddress, ['function CLOCK_MODE() view returns (string)'], provider)

    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.CLOCK_MODE()),
      )
      if (response) {
        const clockMode = response.toString()
        return clockMode.includes('blocknumber') ? IClockMode.BlockNumber : IClockMode.Timestamp
      }
    } catch (_error) {}

    return IClockMode.BlockNumber
  },
}

export default GovernanceErc20Helper
