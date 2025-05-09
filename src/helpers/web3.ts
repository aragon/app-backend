import {
  type HexAddress,
  IConnectionType,
  type IMultiSigSettings,
  IProviderType,
  type IWeb3TokenBalance,
  NetworksEnum,
} from '@types'
import { type Block, Contract, Interface, namehash, type TransactionReceipt } from 'ethers'
import logger from '@logger'
import config from '@config'
import { ERC20 } from '@artifacts/ERC20'
import BottleneckModule from '@modules/bottleneck'
import { ENSRegistry } from '@artifacts/ENSRegistry'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { Multisig } from '@artifacts/Multisig'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { TokenVoting } from '@artifacts/TokenVoting'
import { type BlockTag } from 'ethers/src.ts/providers/provider'
import Web3Utils from '@helpers/web3Utils'
import { ERC721 } from '@artifacts/ERC721'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Helper' })

const Web3Helper = {
  async supportsInterface(tokenAddress: HexAddress, interfaceId: string, network: NetworksEnum): Promise<boolean> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, ERC721.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.supportsInterface(interfaceId)),
      )
    } catch (error) {
      return false
    }
  },

  async getBlockNumber(blockNumber: string | number | undefined | BlockTag, network: NetworksEnum): Promise<number> {
    if (blockNumber === 'latest' || blockNumber === undefined) {
      try {
        const provider = ProviderModule.getAnyRpcProvider(network)
        return await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getBlockNumber()),
        )
      } catch (error) {
        logger.error('Error getBlockNumber', llo({ blockNumber, network, error }))
        return -1
      }
    } else {
      return Number(blockNumber)
    }
  },

  async getBlock(blockNumber: number, network: NetworksEnum): Promise<Block | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getBlock(blockNumber)),
      )
    } catch (error) {
      logger.error('Error getBlock', llo({ blockNumber, network, error }))
      return null
    }
  },

  async getLogs(filter: { fromBlock: string; toBlock: string; topics: any }, network: NetworksEnum) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getLogs(filter)),
      )
    } catch (error) {
      logger.error('Error getLogs', llo({ filter, network, error }))
      return null
    }
  },

  async getBlockTimestamp(blockNumber: number, network: NetworksEnum): Promise<number> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)

      const block = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getBlock(blockNumber)),
      )

      return block?.timestamp ?? 0
    } catch (error) {
      logger.error('Error getBlockTimestamp', llo({ blockNumber, network, error }))
      return 0
    }
  },

  async getTokenBalanceAtBlock({
    address,
    tokenAddress,
    blockNumber,
    network,
  }: {
    address: HexAddress
    tokenAddress: HexAddress
    blockNumber: number
    network: NetworksEnum
  }): Promise<string> {
    let params = {}
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)

      const abi = ['function balanceOf(address account) view returns (uint256)']
      const iface = new Interface(abi)
      const data = iface.encodeFunctionData('balanceOf', [address])

      params = { to: tokenAddress, data }
      const blockTag = `0x${BigInt(blockNumber).toString(16)}`

      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () => provider.call(params, blockTag)),
      )

      const balance = iface.decodeFunctionResult('balanceOf', response)[0]

      return balance.toString()
    } catch (error) {
      logger.error(
        'Error getErc20BalanceAtBlock',
        llo({ rawParams: { address, tokenAddress, blockNumber, network }, error, params }),
      )
      return '0'
    }
  },

  async getChainAdjustedBlockNumber(arbBlock: number, network: NetworksEnum): Promise<number> {
    if (network !== NetworksEnum.arbitrumMainnet) {
      return arbBlock
    }

    try {
      const blockTag = `0x${BigInt(arbBlock).toString(16)}`
      const abi = ['function getL1BlockNumber() view returns (uint256)']
      const address = '0x7eCfBaa8742fDf5756DAC92fbc8b90a19b8815bF' // static contract
      const provider = ProviderModule.getAnyRpcProvider(network)
      const iface = new Interface(abi)
      const data = iface.encodeFunctionData('getL1BlockNumber', [])
      const params = { to: address, data }
      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () => provider.call(params, blockTag)),
      )

      const blockNumberOfL1 = iface.decodeFunctionResult('getL1BlockNumber', response)[0]
      return Number(blockNumberOfL1) - 1
    } catch (e) {
      logger.error('Error getBlockNumberOnArbitrum', llo({ arbBlock, network, error: e }))
      return arbBlock
    }
  },

  async getNativeBalance(address: HexAddress, network: NetworksEnum): Promise<any> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)

      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('eth_getBalance', [address, 'latest']),
        ),
      )

      return response
    } catch (error) {
      logger.error('Error getBalance', llo({ address, network, error }))
      return null
    }
  },

  async getTokenBalances(address: HexAddress, network: NetworksEnum): Promise<IWeb3TokenBalance[]> {
    try {
      const provider = ProviderModule.getProvider(network, IProviderType.ALCHEMY, IConnectionType.RPC)

      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('alchemy_getTokenBalances', [address]),
        ),
      )

      return response?.tokenBalances || []
    } catch (error) {
      logger.error('Error getTokenBalances', llo({ address, network, error }))
      return []
    }
  },

  async ensSubdomainExists(ensName: string, network: NetworksEnum): Promise<boolean> {
    if (!config.SUPPORTED_ENS_NETWORKS.includes(network as any)) {
      return false
    }

    const provider = ProviderModule.getAnyRpcProvider(network)

    try {
      const ensContract = new Contract(config.CONTRACTS.ENS_REGISTRY, ENSRegistry.abi, provider)

      const nameHashed = namehash(ensName)

      const recordExists = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => ensContract.recordExists(nameHashed)),
      )

      return recordExists
    } catch (error) {
      logger.warn(
        'Error ensSubdomainExists',
        llo({
          error,
          ensName,
          network,
        }),
      )
      return false
    }
  },

  async getTransaction(txHash: HexAddress, network: NetworksEnum) {
    const provider = ProviderModule.getAnyRpcProvider(network)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getTransaction(txHash)),
      )
    } catch (error) {
      logger.error(
        'Error get transaction',
        llo({
          txHash,
          error,
        }),
      )
      return null
    }
  },

  async getTransactionReceipt(txHash: HexAddress, network: NetworksEnum): Promise<TransactionReceipt | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getTransactionReceipt(txHash)),
      )
    } catch (error) {
      logger.error(
        'Error get transaction receipt',
        llo({
          txHash,
          error,
        }),
      )
      return null
    }
  },

  async getUnderlying(address: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const underlyingAbi = [
      {
        inputs: [],
        name: 'underlying',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
    ]
    const tokenInstance = new Contract(address, underlyingAbi, provider)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.underlying()),
      )
    } catch (error) {
      logger.warn('Error getting underlying', llo({ error, address }))
    }

    return null
  },

  async getTokenTotalSupply(address: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(address, ERC20.abi, provider)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.totalSupply()),
      )
    } catch (error) {
      logger.warn('Error getting token total supply', llo({ error, address }))
    }

    return 0n
  },

  async getMultisigSettings(address: HexAddress, network: NetworksEnum): Promise<IMultiSigSettings | undefined> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const multisigInstance = new Contract(address, Multisig.abi, provider)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => multisigInstance.multisigSettings()),
      )
    } catch (error) {
      logger.warn('Error getting multisig settings', llo({ error, address }))
    }
  },

  async getTokenInfo(
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    address: HexAddress
    name: string
    symbol: string
    decimals: number
    totalSupply: string
  }> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(address, ERC20.abi, provider)
    const token: any = {
      address: Web3Utils.parseAddress(address) || address,
      decimals: '0',
    }

    try {
      token.name = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.name()),
      )
    } catch (error) {
      logger.warn('Error getting token info name', llo({ error, address }))
    }

    try {
      token.symbol = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.symbol()),
      )
    } catch (error) {
      logger.warn('Error getting token symbol - getTokenInfo', llo({ error, address }))
    }

    try {
      const decimals = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.decimals()),
      )
      token.decimals = Number(decimals)
    } catch (error) {
      logger.warn('Error getting token symbol - getTokenInfo', llo({ error, address }))
    }

    try {
      const totalSupply = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.totalSupply()),
      )
      token.totalSupply = BigInt(totalSupply).toString()
    } catch (error) {
      logger.warn('Error getting token total supply - getTokenInfo', llo({ error, address }))
    }

    return token
  },

  async getERC20Balance(address: HexAddress, tokenAddress: HexAddress, network: NetworksEnum): Promise<bigint> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, ERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.balanceOf(address)),
      )
    } catch (error) {
      return 0n
    }
  },

  async getDaoOsVersion(address: HexAddress, network: NetworksEnum) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(
      address,
      [
        {
          inputs: [],
          name: 'protocolVersion',
          outputs: [
            {
              internalType: 'uint8',
              name: 'major',
              type: 'uint8',
            },
            {
              internalType: 'uint8',
              name: 'minor',
              type: 'uint8',
            },
            {
              internalType: 'uint8',
              name: 'patch',
              type: 'uint8',
            },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      provider,
    )

    let version: [number, number, number]
    try {
      version = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.protocolVersion()),
      )
    } catch (error) {
      version = [1, 0, 0]
    }
    return version.join('.')
  },

  async isMultisigMemberAtBlock(
    pluginAddress: HexAddress,
    memberAddress: HexAddress,
    blockNumber: number,
    network: NetworksEnum,
  ) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(pluginAddress, Multisig.abi, provider)

    try {
      const adjustedBlockNumber = await Web3Helper.getChainAdjustedBlockNumber(blockNumber, network)
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.isListedAtBlock(memberAddress, adjustedBlockNumber),
        ),
      )
    } catch (error) {
      logger.warn('Error isMultisigMemberAtBlock', llo({ pluginAddress, memberAddress, blockNumber, network, error }))
      return false
    }
  },

  async getBlockReceipts(network: NetworksEnum, blockNumber: number) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          provider.send('eth_getBlockReceipts', [`0x${blockNumber.toString(16)}`]),
        ),
      )
    } catch (error) {
      logger.error('Error getBlockReceipts', llo({ blockNumber, network, error }))
      return null
    }
  },

  async getTargetConfig(network: NetworksEnum, pluginAddress: HexAddress) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, Multisig.abi, provider)
      const response = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.getTargetConfig()),
      )

      return response.target
    } catch (error) {
      logger.error('Error getTargetConfig', llo({ pluginAddress, network, error }))
      return null
    }
  },

  async getVotingToken(pluginAddress: HexAddress, Network: NetworksEnum): Promise<HexAddress | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(Network)
      const contract = new Contract(pluginAddress, TokenVoting.abi, provider)
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(Network).schedule(async () => contract.getVotingToken()),
      )
    } catch (error) {
      return null
    }
  },

  async getVotingEscrowAddress(pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(pluginAddress, GaugeVoter.abi, provider)
      const response = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.escrow()),
      )

      return response
    } catch (error) {
      return null
    }
  },

  async getLockTokenAddress(votingEscrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(votingEscrowAddress, VotingEscrow.abi, provider)
      const response = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.lockNFT()),
      )

      return response
    } catch (error) {
      return null
    }
  },

  async getTokenName(tokenAddress: HexAddress, network: NetworksEnum): Promise<string | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(tokenAddress, ERC20.abi, provider)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.name()),
      )
    } catch (error) {
      logger.warn('Error getting token name', llo({ error, address: tokenAddress }))
    }

    return null
  },

  async getTokenSymbol(tokenAddress: HexAddress, network: NetworksEnum): Promise<string | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(tokenAddress, ERC20.abi, provider)

    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.symbol()),
      )
    } catch (error) {
      logger.warn('Error getting token symbol', llo({ error, address: tokenAddress }))
    }

    return null
  },

  async getTokenDecimals(tokenAddress: HexAddress, network: NetworksEnum): Promise<number | 0> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(tokenAddress, ERC20.abi, provider)

    try {
      const decimals = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.decimals()),
      )

      return Number(decimals)
    } catch (error) {
      logger.warn('Error getting token symbol', llo({ error, address: tokenAddress }))
    }

    return 0
  },

  async getTokenNameAndSymbol(tokenAddress: HexAddress, network: NetworksEnum) {
    const token: any = {
      name: null,
      symbol: null,
    }

    token.name = await Web3Helper.getTokenName(tokenAddress, network)
    token.symbol = await Web3Helper.getTokenSymbol(tokenAddress, network)

    return token
  },
  async isMember(pluginAddress: HexAddress, memberAddress: HexAddress, network: NetworksEnum) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const pluginInstance = new Contract(pluginAddress, Multisig.abi, provider)
      const isListed = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => pluginInstance.isListed(memberAddress)),
      )
      return Boolean(isListed)
    } catch (error) {
      logger.error('Error isMember', llo({ pluginAddress, memberAddress, network, error }))
      return false
    }
  },
}

export default Web3Helper
