import { GaugeVoter } from '@artifacts/GaugeVoter'
import { retryRequest } from '@helpers/retryRequest'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { type HexAddress, NetworksEnum } from '@types'
import { Contract, ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:GaugeHelper' })

const GaugeHelper = {
  async getLockNftTokenAddress(pluginAddress: string, network: NetworksEnum): Promise<string | null> {
    try {
      const escrowAddress = await Web3Helper.getVotingEscrowAddress(pluginAddress, network)

      if (escrowAddress) {
        return await Web3Helper.getLockTokenAddress(escrowAddress, network)
      }

      return null
    } catch (_error) {
      return null
    }
  },

  async getGaugeEpochId(pluginAddress: HexAddress, network: NetworksEnum) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const pluginGaugeInstance = new Contract(pluginAddress, GaugeVoter.abi, provider)
      const epochId = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => pluginGaugeInstance.epochId()),
      )
      return Number(epochId).toString()
    } catch (_error) {
      return null
    }
  },

  async getIVotesAdapterAddress(pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    try {
      const abi = ['function ivotesAdapter() view returns (address)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const iVotesAdapterAddress = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.ivotesAdapter(),
        ),
      )

      if (iVotesAdapterAddress === ZeroAddress) {
        return null
      }

      return iVotesAdapterAddress
    } catch (_error) {
      return null
    }
  },

  async getEnableUpdateVotingPowerHookFlag(pluginAddress: HexAddress, network: NetworksEnum): Promise<boolean> {
    try {
      const abi = ['function enableUpdateVotingPowerHook() view returns (bool)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.enableUpdateVotingPowerHook(),
        ),
      )
    } catch (_error) {
      return false
    }
  },

  async currentEpochStart(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function currentEpochStart() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const currentEpochStart = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.currentEpochStart(),
        ),
      )

      return Number(currentEpochStart)
    } catch (_error) {
      return null
    }
  },

  async getGaugeEpochVoteStart(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function epochVoteStart() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const epochVoteStart = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.epochVoteStart(),
        ),
      )

      return Number(epochVoteStart)
    } catch (_error) {
      return null
    }
  },

  async getGaugeEpochVoteEnd(pluginAddress: HexAddress, network: NetworksEnum): Promise<number | null> {
    try {
      const abi = ['function epochVoteEnd() view returns (uint256)']
      const provider = ProviderModule.getAnyRpcProvider(network)
      const gaugePluginContract = new Contract(pluginAddress, abi, provider)

      const epochVoteEnd = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet).schedule(async () =>
          gaugePluginContract.epochVoteEnd(),
        ),
      )

      return Number(epochVoteEnd)
    } catch (_error) {
      return null
    }
  },

  async getUsedVotingPower(
    memberAddress: HexAddress,
    pluginAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function usedVotingPower(address account) external view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.usedVotingPower(memberAddress)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting usedVotingPower', llo({ memberAddress, pluginAddress, network, error }))
      return '0'
    }
  },

  async totalVotingPowerCast(pluginAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function totalVotingPowerCast() public view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.totalVotingPowerCast()),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting totalVotingPowerCast', llo({ pluginAddress, network, error }))
      return '0'
    }
  },

  async getGaugeVotes(gaugeAddress: HexAddress, pluginAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    // Uses getWriteEpochId() internally - returns correct epoch's data
    const abi = ['function gaugeVotes(address _address) public view returns (uint256)']
    const contract = new Contract(pluginAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.gaugeVotes(gaugeAddress)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting gaugeVotes', llo({ gaugeAddress, pluginAddress, network, error }))
      return '0'
    }
  },

  async getVotes(memberAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function getVotes(address account) external view returns (uint256)']
    const contract = new Contract(tokenAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getVotes(memberAddress)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting votes', llo({ memberAddress, tokenAddress, network, error }))
      return '0'
    }
  },

  async getPastVotes(
    memberAddress: HexAddress,
    timePoint: number,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<string> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const abi = ['function getPastVotes(address account, uint256 timepoint) external view returns (uint256);']
    const contract = new Contract(tokenAddress, abi, provider)
    try {
      const vp = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getPastVotes(memberAddress, timePoint)),
      )
      return BigInt(vp).toString()
    } catch (error) {
      logger.error('Error getting votes', llo({ memberAddress, tokenAddress, network, error }))
      return '0'
    }
  },
}

export default GaugeHelper
