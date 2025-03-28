import {
  type ENS,
  type HexAddress,
  type IAlchemyTokenBalance,
  IConnectionType,
  type ILogInfo,
  type IMetadata,
  type IMultiSigSettings,
  type IProposalMetadata,
  IProviderType,
  ITransactionType,
  NetworksEnum,
} from '@types'
import {
  AbiCoder,
  Contract,
  ethers,
  getAddress,
  Interface,
  type Log,
  type LogDescription,
  namehash,
  type TransactionReceipt,
} from 'ethers'
import logger from '@logger'
import config from '@config'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import BottleneckModule from '@modules/bottleneck'
import { ENSRegistry } from '@artifacts/ENSRegistry'
import { retryRequest } from '@helpers/retryRequest'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import BigNumber from 'bignumber.js'
import utils from '@helpers/utils'
import { Multisig } from '@artifacts/Multisig'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { TokenVoting } from '@artifacts/TokenVoting'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Helper' })

const Web3Helper = {
  ERC1155_INTERFACE_ID: '0xd9b67a26',
  ERC165_INTERFACE_ID: '0x01ffc9a7',
  ERC721_INTERFACE_ID: '0x80ac58cd',
  INTERFACE_ID_INVALID: '0xffffffff',

  onERC721Received: '0x150b7a02',
  onERC1155Received: '0xf23a6e61',
  onERC1155BatchReceived: '0xbc197c81',

  ERC721_safeTransferFromNoData: '0x42842e0e',
  ERC721_safeTransferFromWithData: '0xb88d4fde',
  ERC721_transferFrom: '0x23b872dd',

  ERC20_transfer: '0xa9059cbb',
  ERC20_transferFrom: '0x23b872dd',

  ERC1155_safeTransferFrom: '0xf242432a',
  ERC1155_safeBatchTransferFrom: '0x2eb2c2d6',

  isWhitelistedToken: (address: HexAddress, network: NetworksEnum): boolean => {
    return config.WHITELIST_TOKENS.some((token: any) => token.address === address && token.network === network)
  },

  alchemyCrazyBalanceOnError: (
    address: string,
    tokenAddress: string,
    network: NetworksEnum,
    amount: any,
    decimals: number,
  ) => {
    if (typeof amount === 'string' && !amount?.includes('0x')) {
      logger.error('Error alchemyCrazyBalance wrong format', llo({ address, tokenAddress, network, amount, decimals }))
    }
  },

  handleAlchemyCrazyBalance: (amount: number | string, decimals: number = 0, tx?: any): string => {
    try {
      if (typeof amount === 'string' && amount.includes('0x')) {
        return ethers.formatUnits(amount, decimals)
      } else if (utils.isScientificNumber(amount)) {
        if (Number(amount) < 1 && Number(amount) > -1) {
          return Number(amount).toFixed(decimals)
        } else {
          return ethers.formatUnits(Number(amount).toLocaleString('fullwide', { useGrouping: false }), decimals)
        }
      } else if (!isNaN(Number(amount))) {
        return amount.toString()
      } else {
        logger.error('Error not handled amount format', llo({ amount, decimals, tx }))
        return '0'
      }
    } catch (error) {
      logger.error('Error in conversion', llo({ error, amount, decimals, tx }))
      return '0' // Return '0' or handle the error as appropriate
    }
  },

  needToSyncBlockTime(document: any) {
    return !document?.blockTimestamp || document?.blockTimestamp === 0
  },

  getERC20TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Helper.ERC20_transfer:
        return ['address', 'uint256']
      case Web3Helper.ERC20_transferFrom:
        return ['address', 'address', 'uint256']
      default:
        logger.error('Unsupported function selector', llo({ functionSelector }))
        return null
    }
  },

  getERC721TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Helper.ERC721_safeTransferFromNoData:
      case Web3Helper.ERC721_transferFrom:
        return ['address', 'address', 'uint256']
      case Web3Helper.ERC721_safeTransferFromWithData:
        return ['address', 'address', 'uint256', 'bytes']
      default:
        logger.error('Unsupported function selector', llo({ functionSelector }))
        return null
    }
  },

  getERC1155TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Helper.ERC1155_safeTransferFrom:
        return ['address', 'address', 'uint256', 'uint256', 'bytes']
      case Web3Helper.ERC1155_safeBatchTransferFrom:
        return ['address', 'address', 'uint256[]', 'uint256[]', 'bytes']
      default:
        logger.error('Unsupported function selector', llo({ functionSelector }))
        return null
    }
  },

  isERC1155TransferMethod(action: any): boolean {
    const methodSig = Web3Helper.getMethodSignature(action.data)
    return [Web3Helper.ERC1155_safeBatchTransferFrom, Web3Helper.ERC1155_safeTransferFrom].includes(methodSig)
  },

  isERC721Transfer(action: any): boolean {
    const methodSig = Web3Helper.getMethodSignature(action.data)
    return [
      Web3Helper.ERC721_transferFrom,
      Web3Helper.ERC721_safeTransferFromNoData,
      Web3Helper.ERC721_safeTransferFromWithData,
    ].includes(methodSig)
  },

  isERC20Transfer(action: any): boolean {
    const methodSig = Web3Helper.getMethodSignature(action.data)
    return [Web3Helper.ERC20_transfer, Web3Helper.ERC20_transferFrom].includes(methodSig)
  },

  isNativeTokenAction(action: any): boolean {
    return action.data === '0x' && BigInt(action.value) > 0n
  },

  async supportsERC721(tokenAddress: string, network: NetworksEnum): Promise<boolean> {
    const supportsERC165 = await Web3Helper.supportsInterface(tokenAddress, Web3Helper.ERC165_INTERFACE_ID, network)
    const supportsERC721 = await Web3Helper.supportsInterface(tokenAddress, Web3Helper.ERC721_INTERFACE_ID, network)
    const doesNotSupportInvalid = !(await Web3Helper.supportsInterface(
      tokenAddress,
      Web3Helper.INTERFACE_ID_INVALID,
      network,
    ))

    return supportsERC165 && supportsERC721 && doesNotSupportInvalid
  },

  async supportsERC1155(tokenAddress: string, network: NetworksEnum): Promise<boolean> {
    const supportsERC165 = await Web3Helper.supportsInterface(tokenAddress, Web3Helper.ERC165_INTERFACE_ID, network)
    const supportsERC1155 = await Web3Helper.supportsInterface(tokenAddress, Web3Helper.ERC1155_INTERFACE_ID, network)
    const doesNotSupportInvalid = !(await Web3Helper.supportsInterface(
      tokenAddress,
      Web3Helper.INTERFACE_ID_INVALID,
      network,
    ))

    return supportsERC165 && supportsERC1155 && doesNotSupportInvalid
  },

  async supportsInterface(tokenAddress: string, interfaceId: string, network: NetworksEnum): Promise<boolean> {
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

  formatAddress(address: HexAddress) {
    try {
      const abi = AbiCoder.defaultAbiCoder().decode(['address'], address)
      return abi[0]
    } catch (error) {
      logger.warn('Error formatAddress', llo({ address, error }))
      return address
    }
  },

  decodeCalldata(decodeABI: string[], calldata: any) {
    try {
      return AbiCoder.defaultAbiCoder().decode(decodeABI, calldata)
    } catch (error) {
      return null
    }
  },

  parseERC721Action(decoded: any): { from: string | null; to: string | null; tokenId: string } {
    const [from, to, tokenId] = decoded
    return { from, to, tokenId: tokenId?.toString() }
  },

  parseERC1155Action(decoded: any): { from: string | null; to: string | null; tokenId: string; amount: number } {
    const [from, to, tokenId, amount] = decoded
    return { from, to, tokenId: tokenId?.toString(), amount: Number(amount) }
  },

  parseERC1155BatchAction(decoded: any): { from: string | null; to: string | null; tokenIds: string; amounts: number } {
    const [from, to, tokenIds, amounts] = decoded
    return {
      from,
      to,
      tokenIds: tokenIds.map((w: any) => w?.toString()),
      amounts: amounts.map((amount: any) => Number(amount)),
    }
  },

  parseERC20TransferAction(
    functionSelector: string,
    decoded: any,
    txLog: Log,
  ): { from: string | null; to: string | null; amount: number } {
    let from: string | null = null
    let to: string | null = null
    let amount: number = 0

    switch (functionSelector) {
      case Web3Helper.ERC20_transfer:
        from = txLog.address
        ;[to, amount] = decoded
        break
      case Web3Helper.ERC20_transferFrom:
        ;[from, to, amount] = decoded
        break
    }

    return { from, to, amount: Number(amount) }
  },

  getActionTransactionType(from: string | null, to: string | null, daoAddress: string): ITransactionType {
    // If from/to both aren't equal to dao, it means
    // dao must have been approved for the `tokenId`
    // and played the role of transferring between 2 parties.
    if (from !== daoAddress && to !== daoAddress) {
      return ITransactionType.externalTransfer
    }

    if (from !== daoAddress && to === daoAddress) {
      // 1. some party `y` approved `x` tokenId to the dao.
      // 2. dao calls transferFrom as an action to transfer it from `y` to itself.
      return ITransactionType.deposit
    }

    // from is dao address, to is some other address
    return ITransactionType.withdraw
  },

  getMethodSignature(data: any): string {
    return data.slice(0, 10)
  },

  extractMetadataUri(metadataHex: string) {
    try {
      const metadataBytes = Buffer.from(metadataHex.substring(2), 'hex')
      return metadataBytes.toString('utf8')
    } catch (error) {
      logger.error('Error extractMetadataUri', llo({ metadataHex, error }))
      return null
    }
  },

  parseInfoLog(txLog: Log | any, eventName: string, network: NetworksEnum): ILogInfo {
    return {
      network,
      address: ethers.getAddress(txLog.address),
      blockNumber: utils.parseNumber(txLog.blockNumber),
      transactionHash: txLog.transactionHash || txLog.hash,
      transactionIndex: utils.parseNumber(txLog.transactionIndex),
      logIndex: utils.parseNumber(txLog.index ?? txLog.logIndex),
      eventName,
    }
  },

  convertBalanceToUsd: (balance: string, tokenRate: string, decimals: number = 0): string => {
    try {
      BigNumber.config({ DECIMAL_PLACES: decimals, ROUNDING_MODE: BigNumber.ROUND_DOWN })

      const primaryUnitBN = new BigNumber(balance)
      const rateBN = new BigNumber(tokenRate)

      const usdValue = primaryUnitBN.multipliedBy(rateBN)

      return usdValue.toFixed(2)
    } catch (error) {
      logger.error('Error in conversion', llo({ error, balance, tokenRate, decimals }))
      return '0'
    }
  },

  parseLog(txLog: Log, iFace: any): LogDescription | null {
    let event = null as any
    try {
      event = iFace.parseLog(txLog)
    } catch (error: any) {
      if (!error?.message.includes('out-of-bounds')) {
        logger.error('Error parseLog', llo({ txLog, error }))
      }
      return null
    }

    return event
  },

  findLogsByName: (
    txReceipt: TransactionReceipt,
    eventName: string,
    abi: any,
  ): { parsed: LogDescription | null; txLog: Log }[] | [] => {
    try {
      const eventTopicHash = abi
        .filter((item: any) => item.type === 'event' && item.name === eventName)
        .map((event: any) => new Interface(abi).getEvent(event.name)?.topicHash)[0]

      if (!eventTopicHash) {
        logger.error('Error eventTopicHash not found', llo({ txReceipt, eventName }))
        return []
      }

      const matchingLogs = txReceipt.logs.filter((log: any) => log.topics[0] === eventTopicHash)

      const parsedEvents = matchingLogs.map(log => ({
        parsed: new Interface(abi).parseLog(log),
        txLog: log,
      }))

      return parsedEvents
    } catch (error) {
      logger.error('Error parse eventTopicHash', llo({ txReceipt, eventName, error }))
      return []
    }
  },

  parseDaoMetadata(metadata: IMetadata): IMetadata {
    const parsedMetadata: IMetadata = {
      name: null,
      description: null,
      avatar: null,
      links: [],
      stageNames: [],
      processKey: null,
    }

    if (!metadata) {
      return parsedMetadata
    }

    if (metadata.name) {
      parsedMetadata.name = metadata.name
    }

    if (metadata.description) {
      parsedMetadata.description = metadata.description
    }

    if (metadata.avatar) {
      parsedMetadata.avatar = metadata.avatar
    }

    if (metadata.links && metadata.links.length > 0) {
      parsedMetadata.links = metadata.links
    }

    if (metadata.stageNames && metadata.stageNames.length > 0) {
      parsedMetadata.stageNames = metadata.stageNames
    }

    if (metadata.processKey) {
      parsedMetadata.processKey = metadata.processKey
    }

    return parsedMetadata
  },

  parseProposalMetadata(metadata: IProposalMetadata): IProposalMetadata {
    const parsedMetadata: IProposalMetadata = {
      title: null,
      summary: null,
      description: null,
      resources: [],
      media: {
        header: null,
        logo: null,
      },
    }

    if (!metadata) {
      return parsedMetadata
    }

    if (metadata.title) {
      parsedMetadata.title = metadata.title
    }

    if (metadata.summary) {
      parsedMetadata.summary = metadata.summary
    }

    if (metadata.description) {
      parsedMetadata.description = metadata.description
    }

    if (metadata.resources && metadata.resources.length > 0) {
      parsedMetadata.resources = metadata.resources
    }

    if (metadata?.media?.header) {
      parsedMetadata.media!.header = metadata.media.header
    }

    if (metadata?.media?.header) {
      parsedMetadata.media!.logo = metadata.media.logo
    }

    return parsedMetadata
  },

  parseAddress(address: HexAddress): HexAddress | null {
    try {
      return getAddress(address)
    } catch (error) {
      logger.error(
        'Error checksum address',
        llo({
          address,
          error,
        }),
      )
      return null
    }
  },

  convertToHexNumber(number: number): string | undefined {
    if (!number && number !== 0) {
      return
    }
    return '0x' + number?.toString(16)
  },

  async getBlockNumber(blockNumber: string | number | undefined, network: NetworksEnum): Promise<number> {
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

  async getBlock(blockNumber: number, network: NetworksEnum) {
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

  async getBalance(address: HexAddress, network: NetworksEnum): Promise<string> {
    try {
      const provider = ProviderModule.getAnyRpcProvider(network)

      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('eth_getBalance', [address, 'latest']),
        ),
      )

      const token = await ProxyToken.saveAndGetToken(utils.zeroAddress, network)

      if (!token) {
        logger.error('getBalance token not found', llo())
        return '0'
      }

      const balance = Web3Helper.handleAlchemyCrazyBalance(response, token?.decimals)
      // check if alchemy return strange balance
      Web3Helper.alchemyCrazyBalanceOnError(address, token?.address, network, response, token?.decimals)
      return balance
    } catch (error) {
      logger.error('Error getBalance', llo({ address, network, error }))
      return '0'
    }
  },

  async getTokenBalances(address: HexAddress, network: NetworksEnum): Promise<IAlchemyTokenBalance[] | []> {
    try {
      const provider = ProviderModule.getProvider(network, IProviderType.ALCHEMY, IConnectionType.RPC)

      const response = await retryRequest(async () =>
        BottleneckModule.getAlchemyBalanceLimiter(network).schedule(async () =>
          provider.send('alchemy_getTokenBalances', [address]),
        ),
      )

      const balances = await Promise.all(
        response?.tokenBalances
          ?.filter(
            (token: any) => token.tokenBalance !== '0x0000000000000000000000000000000000000000000000000000000000000000',
          )
          ?.map(async (alchemyBalance: any) => {
            const token = await ProxyToken.saveAndGetToken(alchemyBalance.contractAddress, network)
            // check if alchemy return strange balance
            Web3Helper.alchemyCrazyBalanceOnError(
              alchemyBalance.contractAddress,
              token?.address!,
              network,
              alchemyBalance.tokenBalance,
              token?.decimals!,
            )
            const result: IAlchemyTokenBalance = {
              contractAddress:
                Web3Helper.parseAddress(alchemyBalance.contractAddress) || alchemyBalance.contractAddress,
              tokenBalance: Web3Helper.handleAlchemyCrazyBalance(alchemyBalance.tokenBalance, token?.decimals),
              originalBalance: alchemyBalance.tokenBalance,
            }
            return result
          }),
      )

      return balances.filter((token: any) => token.tokenBalance !== '0')
    } catch (error) {
      logger.error('Error getTokenBalances', llo({ address, network, error }))
      return []
    }
  },

  parseSubdomainToEns(subdomain: string): ENS | undefined {
    return `${subdomain}.${config.ENS_DOMAIN}` as ENS
  },

  async subdomainExists(ensName: string, network: NetworksEnum): Promise<boolean> {
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
        'Error subdomainExists',
        llo({
          error,
          ensName,
          network,
        }),
      )
      return false
    }
  },

  async getTransaction(txHash: string, network: NetworksEnum) {
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

  async getTransactionReceipt(txHash: string, network: NetworksEnum): Promise<TransactionReceipt | null> {
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
      address: Web3Helper.parseAddress(address) || address,
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

  getDataFromTxReceipt: async ({
    txLog,
    eventName,
    abi,
    network,
  }: {
    txLog: Log
    eventName: string
    abi: any
    network: NetworksEnum
  }): Promise<{ txReceipt: TransactionReceipt; events: any } | undefined> => {
    const txReceipt = await Web3Helper.getTransactionReceipt(txLog.transactionHash, network)

    if (!txReceipt) {
      logger.error('Failed to find txReceipt', llo({ txHash: txLog.transactionHash, network }))
      return
    }
    const events = Web3Helper.findLogsByName(txReceipt, eventName, abi)

    if (events.length === 0) {
      logger.error('Failed to find event', llo({ eventName, txHash: txLog.transactionHash, network }))
      return
    }

    return { txReceipt, events }
  },

  async getERC20Balance(address: string, tokenAddress: string, network: NetworksEnum): Promise<bigint> {
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

  async getTargetConfig(network: NetworksEnum, pluginAddress: string) {
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

  async getVotingToken(pluginAddress: string, Network: NetworksEnum): Promise<string | null> {
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

  async getVotingEscrowAddress(pluginAddress: string, network: NetworksEnum): Promise<string | null> {
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

  async getLockTokenAddress(votingEscrowAddress: string, network: NetworksEnum): Promise<string | null> {
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

  async getTokenNameAndSymbol(tokenAddress: string, network: NetworksEnum) {
    const provider = ProviderModule.getAnyRpcProvider(network)
    const tokenInstance = new Contract(tokenAddress, ERC20.abi, provider)
    const token: any = {
      name: null,
      symbol: null,
    }

    try {
      token.name = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.name()),
      )
    } catch (error) {
      logger.warn('Error getting token info name', llo({ error, address: tokenAddress }))
    }

    try {
      token.symbol = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(network).schedule(async () => tokenInstance.symbol()),
      )
    } catch (error) {
      logger.warn('Error getting token symbol - getTokenNameAndSymbol', llo({ error, address: tokenAddress }))
    }

    return token
  },
}

export default Web3Helper
