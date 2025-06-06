import { type HexAddress, type NetworksEnum } from '@types'
import { Contract } from 'ethers'
import BottleneckModule from '@modules/bottleneck'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { ExitQueue } from '@artifacts/ExitQueue'
import { LinearIncreasingCurve } from '@artifacts/LinearIncreasingCurve'

const GovernanceVeHelper = {
  async getEscrowAddress(voterAdapter: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function escrow() view returns (address)']
    const contract = new Contract(voterAdapter, abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.escrow()),
      )
    } catch (error) {
      return null
    }
  },

  async getClockAddress(voterAdapter: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function clock() view returns (address)']
    const contract = new Contract(voterAdapter, abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.clock()),
      )
    } catch (error) {
      return null
    }
  },

  async getCurveAddress(votingEscrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function curve() view returns (address)']
    const contract = new Contract(votingEscrowAddress, abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.curve()),
      )
    } catch (error) {
      return null
    }
  },

  async getExitQueueAddress(votingEscrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function queue() view returns (address)']
    const contract = new Contract(votingEscrowAddress, abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.queue()),
      )
    } catch (error) {
      return null
    }
  },

  async getNftLockAddress(votingEscrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function lockNFT() view returns (address)']
    const contract = new Contract(votingEscrowAddress, abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.lockNFT()),
      )
    } catch (error) {
      return null
    }
  },

  async getErc20TokenAddress(votingEscrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function token() view returns (address)']
    const contract = new Contract(votingEscrowAddress, abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.token()),
      )
    } catch (error) {
      return null
    }
  },

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

  async getSlopeFromCoefficients(curveAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(curveAddress, LinearIncreasingCurve.abi, provider)
    try {
      const coefficients = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.getCoefficients(BigInt('1000000000000000000')),
        ),
      )
      return coefficients[1] as bigint
    } catch (error) {
      return 0n
    }
  },

  async getLockVotingPowerAt(
    curveAddress: HexAddress,
    tokenId: string,
    ts: number,
    network: NetworksEnum,
  ): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(curveAddress, LinearIncreasingCurve.abi, provider)
    try {
      const votingPower = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.votingPowerAt(BigInt(tokenId), BigInt(ts)),
        ),
      )
      return votingPower as bigint
    } catch (error) {
      return 0n
    }
  },
}

export default GovernanceVeHelper
