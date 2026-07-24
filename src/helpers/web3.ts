import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Multisig } from '@artifacts/Multisig'
import { TokenVoting } from '@artifacts/TokenVoting'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import config from '@config'
import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import { retryRequest } from '@helpers/retryRequest'
import Utils from '@helpers/utils'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import {
  type HexAddress,
  IConnectionType,
  type IFormattedLog,
  type IMultiSigSettings,
  IProviderType,
  NetworksEnum,
} from '@types'
import { type Block, type BlockTag, Contract, ethers, Interface, type TransactionReceipt } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Helper' })

const Web3Helper = {
  async supportsInterface(tokenAddress: HexAddress, interfaceId: string, network: NetworksEnum): Promise<boolean> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, ERC721.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.supportsInterface(interfaceId)),
      )
    } catch (_error) {
      return false
    }
  },

  async getBlockNumber(blockNumber: string | number | undefined | BlockTag, network: NetworksEnum): Promise<number> {
    if (blockNumber === 'latest' || blockNumber === undefined) {
      try {
        const provider = ProviderModule.getAnyRpcProvider(network)
        const blockNumber = await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(network).schedule(async () => provider.getBlockNumber()),
        )
        return Number(blockNumber)
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
      const provider = ProviderModule.getProvider(network, IProviderType.ALCHEMY, IConnectionType.RPC)

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

  async _getChainAdjustedBlockNumber(
    blockTag: string,
    contractAddr: HexAddress,
    functionName: string,
    network: NetworksEnum,
  ): Promise<number> {
    const functionSelector = '0x' + ethers.keccak256(ethers.toUtf8Bytes(functionName)).slice(2, 10)
    const provider = ProviderModule.getAnyRpcProvider(network)
    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('eth_call', [
            {
              to: contractAddr,
              data: functionSelector,
            },
            blockTag,
          ]),
        ),
      )
      return Number(response) - 1
    } catch (error) {
      logger.error('Error _getChainAdjustedBlockNumber', llo({ blockTag, contractAddr, functionName, network, error }))
      return Number(blockTag)
    }
  },

  async getChainAdjustedBlockNumber(arbBlock: number, network: NetworksEnum) {
    const blockTag = `0x${BigInt(arbBlock).toString(16)}`
    switch (network) {
      case NetworksEnum.cornMainnet:
        return await Web3Helper._getChainAdjustedBlockNumber(
          blockTag,
          '0xcA11bde05977b3631167028862bE2a173976CA11',
          'getBlockNumber()',
          network,
        )
      case NetworksEnum.arbitrumMainnet:
        return await Web3Helper._getChainAdjustedBlockNumber(
          blockTag,
          '0x7eCfBaa8742fDf5756DAC92fbc8b90a19b8815bF',
          'getL1BlockNumber()',
          network,
        )
      default:
        return arbBlock
    }
  },

  async getNativeBalance(address: HexAddress, network: NetworksEnum): Promise<string | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)

      return await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('eth_getBalance', [address, 'latest']),
        ),
      )
    } catch (error) {
      logger.error('Error getBalance', llo({ address, network, error }))
      return null
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
    return (await Web3Helper.getERC20BalanceOrNull(address, tokenAddress, network)) ?? 0n
  },

  async getERC20BalanceOrNull(
    address: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<bigint | null> {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const contract = new Contract(tokenAddress, ERC20.abi, provider)
    try {
      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => contract.balanceOf(address)),
      )
    } catch (error) {
      logger.error('Failed to read ERC20 balance', llo({ address, tokenAddress, network, error }))
      return null
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
    } catch (_error) {
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

  async getVotingSettings(address: HexAddress, network: NetworksEnum, blockNumber: number) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(address, TokenVoting.abi, provider)
      const blockTag = { blockTag: blockNumber }

      return await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => {
          const [votingMode, supportThreshold, minParticipation, minDuration, minProposerVotingPower] =
            await Promise.all([
              contract.votingMode(blockTag),
              contract.supportThreshold(blockTag),
              contract.minParticipation(blockTag),
              contract.minDuration(blockTag),
              contract.minProposerVotingPower(blockTag),
            ])
          return { votingMode, supportThreshold, minParticipation, minDuration, minProposerVotingPower }
        }),
      )
    } catch (error) {
      logger.warn('Error getting voting settings', llo({ error, address, blockNumber }))
      return null
    }
  },

  // Reads the linked TokenVoting (stage-1) proposal through the Objection plugin, returning its
  // tally so the objection sub-proposal can start from the first stage's results
  async getTokenVotingProposal(
    address: HexAddress,
    proposalId: string,
    network: NetworksEnum,
    blockNumber: number,
  ): Promise<{ abstain: string; yes: string; no: string } | null> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const contract = new Contract(address, TokenVoting.abi, provider)

      const [, tally] = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () =>
          contract.getTokenVotingProposal(proposalId, { blockTag: blockNumber }),
        ),
      )

      return {
        abstain: tally.abstain.toString(),
        yes: tally.yes.toString(),
        no: tally.no.toString(),
      }
    } catch (error) {
      logger.warn('Error getting tokenVoting proposal tally', llo({ error, address, proposalId, blockNumber }))
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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

  async isMultisigMember(pluginAddress: HexAddress, memberAddress: HexAddress, network: NetworksEnum) {
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

  async isTokenVotingMember(pluginAddress: HexAddress, memberAddress: HexAddress, network: NetworksEnum) {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)
      const pluginInstance = new Contract(pluginAddress, TokenVoting.abi, provider)
      const isMember = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => pluginInstance.isMember(memberAddress)),
      )
      return Boolean(isMember)
    } catch (error) {
      logger.error('Error isTokenVotingMember', llo({ pluginAddress, memberAddress, network, error }))
      return false
    }
  },

  async findBlockAtTimestamp(targetTs: number, network: NetworksEnum): Promise<number> {
    const block = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ROUTESCAN, targetTs, network, 'before')
    if (block > 0) return block

    const fallback = await evmExplorerClient.getBlockByTimestamp(EvmExplorerEnum.ETHERSCAN, targetTs, network, 'before')
    if (fallback > 0) return fallback

    logger.warn('findBlockAtTimestamp: explorers failed, using block estimate', llo({ targetTs, network }))
    return Web3Helper.estimateBlockAtTimestamp(targetTs, network)
  },

  async estimateBlockAtTimestamp(targetTs: number, network: NetworksEnum): Promise<number> {
    const currentBlock = await Web3Helper.getBlockNumber('latest', network)
    const currentTs = await Web3Helper.getBlockTimestamp(currentBlock, network)
    const avgBlockTime = config.NODES[Utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
    return Math.max(1, currentBlock - Math.ceil((currentTs - targetTs) / avgBlockTime))
  },

  sortLogs(logs: IFormattedLog[]): IFormattedLog[] {
    return logs.sort((a, b) => {
      if (a.info.blockNumber !== b.info.blockNumber) return a.info.blockNumber - b.info.blockNumber
      return a.info.logIndex - b.info.logIndex
    })
  },
}

export default Web3Helper
