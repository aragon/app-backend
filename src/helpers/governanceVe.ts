import { type HexAddress, type NetworksEnum } from '@types'
import { Contract } from 'ethers'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { ExitQueue } from '@artifacts/ExitQueue'
import { LinearIncreasingCurve } from '@artifacts/LinearIncreasingCurve'

const GovernanceVeHelper = {
  async getMinDeposit(votingEscrowAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(votingEscrowAddress, VotingEscrowIncreasing.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.minDeposit()),
      )
    } catch (error) {
      return 0n
    }
  },

  async getMinLock(exitQueueAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(exitQueueAddress, ExitQueue.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.minLock()),
      )
    } catch (error) {
      return 0n
    }
  },

  async getCooldown(exitQueueAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(exitQueueAddress, ExitQueue.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.cooldown()),
      )
    } catch (error) {
      return 0n
    }
  },

  async getMaxTime(curveAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(curveAddress, LinearIncreasingCurve.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.maxTime()),
      )
    } catch (error) {
      return 0n
    }
  },

  async getSlope(curveAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(curveAddress, LinearIncreasingCurve.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.slope()),
      )
    } catch (error) {
      return 0n
    }
  },
}

export default GovernanceVeHelper
