import {
  type HexAddress,
  type ILogInfo,
  type IMetadata,
  type IProposalMetadata,
  type NetworksEnum,
  type ICampaignMetadata,
  type KnownActionSignature,
} from '@types'
import { AbiCoder, ethers, getAddress, Interface, type Log, type LogDescription, type TransactionReceipt } from 'ethers'
import logger from '@logger'
import config from '@config'
import BigNumber from 'bignumber.js'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Utils' })

const Web3Utils = {
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

  formatAddress(address: HexAddress) {
    try {
      const abi = AbiCoder.defaultAbiCoder().decode(['address'], address)
      return abi[0]
    } catch (error) {
      logger.warn('Error formatAddress', llo({ address, error }))
      return address
    }
  },

  getERC20TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Utils.ERC20_transfer:
        return ['address', 'uint256']
      case Web3Utils.ERC20_transferFrom:
        return ['address', 'address', 'uint256']
      default:
        logger.error('Unsupported function selector', llo({ functionSelector }))
        return null
    }
  },

  getFunctionSelector(action: KnownActionSignature): string {
    return ethers.id(action).slice(0, 10)
  },

  getERC721TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Utils.ERC721_safeTransferFromNoData:
      case Web3Utils.ERC721_transferFrom:
        return ['address', 'address', 'uint256']
      case Web3Utils.ERC721_safeTransferFromWithData:
        return ['address', 'address', 'uint256', 'bytes']
      default:
        logger.error('Unsupported function selector', llo({ functionSelector }))
        return null
    }
  },

  getERC1155TransferABI(functionSelector: string): string[] | null {
    switch (functionSelector) {
      case Web3Utils.ERC1155_safeTransferFrom:
        return ['address', 'address', 'uint256', 'uint256', 'bytes']
      case Web3Utils.ERC1155_safeBatchTransferFrom:
        return ['address', 'address', 'uint256[]', 'uint256[]', 'bytes']
      default:
        logger.error('Unsupported function selector', llo({ functionSelector }))
        return null
    }
  },

  isERC1155TransferMethod(action: any): boolean {
    const methodSig = Web3Utils.getMethodSignature(action.data)
    return [Web3Utils.ERC1155_safeBatchTransferFrom, Web3Utils.ERC1155_safeTransferFrom].includes(methodSig)
  },

  isERC721Transfer(action: any): boolean {
    const methodSig = Web3Utils.getMethodSignature(action.data)
    return [
      Web3Utils.ERC721_transferFrom,
      Web3Utils.ERC721_safeTransferFromNoData,
      Web3Utils.ERC721_safeTransferFromWithData,
    ].includes(methodSig)
  },

  isERC20Transfer(action: any): boolean {
    const methodSig = Web3Utils.getMethodSignature(action.data)
    return [Web3Utils.ERC20_transfer, Web3Utils.ERC20_transferFrom].includes(methodSig)
  },

  isNativeTokenAction(action: any): boolean {
    return action.data === '0x' && BigInt(action.value) > 0n
  },

  isWhitelistedToken: (address: HexAddress, network: NetworksEnum): boolean => {
    return config.WHITELIST_TOKENS.some((token: any) => token.address === address && token.network === network)
  },

  needToSyncBlockTime(document: any) {
    return !document?.blockTimestamp || document?.blockTimestamp === 0
  },

  async supportsERC721(tokenAddress: string, network: NetworksEnum): Promise<boolean> {
    const supportsERC165 = await Web3Helper.supportsInterface(tokenAddress, Web3Utils.ERC165_INTERFACE_ID, network)
    const supportsERC721 = await Web3Helper.supportsInterface(tokenAddress, Web3Utils.ERC721_INTERFACE_ID, network)
    const doesNotSupportInvalid = !(await Web3Helper.supportsInterface(
      tokenAddress,
      Web3Utils.INTERFACE_ID_INVALID,
      network,
    ))

    return supportsERC165 && supportsERC721 && doesNotSupportInvalid
  },

  async supportsERC1155(tokenAddress: string, network: NetworksEnum): Promise<boolean> {
    const supportsERC165 = await Web3Helper.supportsInterface(tokenAddress, Web3Utils.ERC165_INTERFACE_ID, network)
    const supportsERC1155 = await Web3Helper.supportsInterface(tokenAddress, Web3Utils.ERC1155_INTERFACE_ID, network)
    const doesNotSupportInvalid = !(await Web3Helper.supportsInterface(
      tokenAddress,
      Web3Utils.INTERFACE_ID_INVALID,
      network,
    ))

    return supportsERC165 && supportsERC1155 && doesNotSupportInvalid
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
      case Web3Utils.ERC20_transfer:
        from = txLog.address
        ;[to, amount] = decoded
        break
      case Web3Utils.ERC20_transferFrom:
        ;[from, to, amount] = decoded
        break
    }

    return { from, to, amount: Number(amount) }
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
      blockedCountries: [],
      termsConditionsUrl: null,
      enableOfacCheck: null,
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

    if (metadata.processKey || metadata.policyKey) {
      parsedMetadata.processKey = metadata.processKey || metadata.policyKey
    }

    if (metadata.blockedCountries && Array.isArray(metadata.blockedCountries)) {
      parsedMetadata.blockedCountries = metadata.blockedCountries.filter((country: any) => typeof country === 'string')
    }

    if (metadata.termsConditionsUrl) {
      parsedMetadata.termsConditionsUrl = metadata.termsConditionsUrl.toString()
    }

    if (typeof metadata.enableOfacCheck === 'boolean') {
      parsedMetadata.enableOfacCheck = metadata.enableOfacCheck
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

  parseCampaignMetadata(metadata: any): any {
    const parsedMetadata: ICampaignMetadata = {
      title: null,
      description: null,
      resources: [],
      type: null,
    }

    if (!metadata) {
      return parsedMetadata
    }

    if (metadata.title) {
      parsedMetadata.title = metadata.title
    }

    if (metadata.description) {
      parsedMetadata.description = metadata.description
    }

    if (metadata.resources && metadata.resources.length > 0) {
      parsedMetadata.resources = metadata.resources
    }

    if (metadata.type) {
      parsedMetadata.type = metadata.type
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
}

export default Web3Utils
