import { type HexAddress, type IDaoMetadata, type IProposalMetadata, ITransactionType, type NetworksEnum } from '@types'
import {
  Interface,
  AbiCoder,
  Contract,
  type Filter,
  getAddress,
  type Log,
  namehash,
  type WebSocketProvider,
  type TransactionReceipt,
  type LogDescription,
} from 'ethers'
import { ConfigState } from '@state/configState'
import { ENSSubdomainRegistrar } from '@artifacts/ENSSubdomainRegistrar'
import logger from '@logger'
import config from '@config'
import { ERC20 } from '@artifacts/ERC20'
import { ERC721 } from '@artifacts/ERC721'
import { ERC1155 } from '@artifacts/ERC1155'

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

  getERC20TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Helper.ERC20_transfer:
        return ['address', 'uint256']
      case Web3Helper.ERC20_transferFrom:
        return ['address', 'address', 'uint256']
      default:
        logger.error('Unsupported function selector', { functionSelector })
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
        logger.error('Unsupported function selector', { functionSelector })
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
        logger.error('Unsupported function selector', { functionSelector })
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
    return action.data === '0x' && action.value > 0n
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
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider
    const contract = new Contract(tokenAddress, ERC721.abi, provider)
    try {
      return await contract.supportsInterface(interfaceId)
    } catch (error) {
      return false
    }
  },

  formatAddress(address: HexAddress) {
    const trimmedAddress = address.replace(/^0x0+/, '0x')
    return getAddress(trimmedAddress)
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
    txLog: any,
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

  parseDaoMetadata(metadata: IDaoMetadata): IDaoMetadata {
    const parsedMetadata: IDaoMetadata = {
      name: null,
      description: null,
      avatar: null,
      links: [],
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

  parseAddress(address: HexAddress, extraLog?: any): HexAddress | null {
    try {
      return getAddress(address) as HexAddress
    } catch (error) {
      logger.error(
        'Error checksum dao address',
        llo({
          address,
          error,
          extraLog,
        }),
      )
      return null
    }
  },

  async getAddressFromEns(name: string, network: NetworksEnum): Promise<HexAddress | null> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const address = (await provider.resolveName(name)) as HexAddress | null
      return address
    } catch (error) {
      logger.error(
        'Error resolving ENS name',
        llo({
          name,
          network,
        }),
      )
      return null
    }
  },

  async getEnsFromAddress(address: string, network: NetworksEnum): Promise<string | null> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const ensName = await provider.lookupAddress(address)
      return ensName
    } catch (error) {
      logger.error(
        'Error looking up address',
        llo({
          address,
          network,
        }),
      )
      return null
    }
  },

  async ensExists(ensName: string, network: NetworksEnum): Promise<boolean> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const ensContract = new Contract(config.CONTRACTS.ENS_REGISTRY, ENSSubdomainRegistrar.abi, provider)

      const nameHashed = namehash(ensName)
      const recordExists = await ensContract.recordExists(nameHashed)

      return recordExists
    } catch (error) {
      logger.error(
        'Error ensExists',
        llo({
          ensName,
          network,
        }),
      )
      return false
    }
  },

  async getTransaction(txHash: string, network: NetworksEnum) {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const transaction = await provider.getTransaction(txHash)
      return transaction
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

  async getTransactionReceipt(txHash: string, network: NetworksEnum) {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const transactionDetails = await provider.getTransactionReceipt(txHash)
      return transactionDetails
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

  async queryLogs(filter: Filter, network: NetworksEnum): Promise<Log[]> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider

    try {
      const logs = await provider.getLogs(filter)
      return logs
    } catch (error) {
      logger.error(
        'Error querying logs',
        llo({
          filter,
          network,
          error,
        }),
      )
      return []
    }
  },

  async getERC20Info(
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    address: HexAddress
    name: string
    symbol: string
    decimals: number
    totalSupply: number
  }> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider
    const tokenInstance = new Contract(address, ERC20.abi, provider)
    const token: any = { address }

    try {
      token.name = await tokenInstance.name()
    } catch (error) {
      logger.error('Error getting token info name', llo({ error, address }))
    }

    try {
      token.symbol = await tokenInstance.symbol()
    } catch (error) {
      logger.error('Error getting token symbol', llo({ error, address }))
    }

    try {
      const decimals = await tokenInstance.decimals()
      token.decimals = Number(decimals)
    } catch (error) {
      logger.error('Error getting token symbol', llo({ error, address }))
    }

    try {
      const totalSupply = await tokenInstance.totalSupply()
      token.totalSupply = Number(totalSupply)
    } catch (error) {
      logger.error('Error getting token total supply:', llo({ error, address }))
    }

    return token
  },

  async getERC721Info(
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    address: HexAddress
    name: string
    symbol: string
  }> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider
    const tokenInstance = new Contract(address, ERC721.abi, provider)
    const token: any = { address }

    try {
      token.name = await tokenInstance.name()
    } catch (error) {
      logger.error('Error getting token info name', llo({ error, address }))
    }

    try {
      token.symbol = await tokenInstance.symbol()
    } catch (error) {
      logger.error('Error getting token symbol', llo({ error, address }))
    }

    return token
  },

  async getERC1155Info(
    address: HexAddress,
    network: NetworksEnum,
  ): Promise<{
    address: HexAddress
    name: string
    symbol: string
  }> {
    const provider = ConfigState.getInstance().getConfigItem(network) as WebSocketProvider
    const tokenInstance = new Contract(address, ERC1155.abi, provider)
    const token: any = { address }

    try {
      token.name = await tokenInstance.name()
    } catch (error) {
      logger.error('Error getting token info name', llo({ error, address }))
    }

    try {
      token.symbol = await tokenInstance.symbol()
    } catch (error) {
      logger.error('Error getting token symbol', llo({ error, address }))
    }

    return token
  },

  getDataFromTxReceipt: async ({
    txLog,
    eventName,
    abi,
    network,
  }: {
    txLog: any
    eventName: string
    abi: any
    network: NetworksEnum
  }): Promise<{ txReceipt: TransactionReceipt; events: any } | undefined> => {
    const txReceipt = await Web3Helper.getTransactionReceipt(txLog.transactionHash, network)

    if (!txReceipt) {
      logger.error('Failed to find txReceipt', { txHash: txLog.transactionHash, network })
      return
    }
    const events = Web3Helper.findLogsByName(txReceipt, eventName, abi)

    if (events.length === 0) {
      logger.error('Failed to find event', { eventName, txHash: txLog.transactionHash, network })
      return
    }

    return { txReceipt, events }
  },
}

export default Web3Helper
