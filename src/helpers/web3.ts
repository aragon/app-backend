import { type HexAddress, type IDaoMetadata, type IProposalMetadata, type NetworksEnum } from '@types'
import {
  Contract,
  type Filter,
  getAddress,
  Interface,
  type Log,
  namehash,
  type TransactionReceipt,
  type WebSocketProvider,
} from 'ethers'
import { ConfigState } from '@state/configState'
import { ENSSubdomainRegistrar } from '@artifacts/ENSSubdomainRegistrar'
import logger from '@logger'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'helpers:Web3Utils' })

const Web3Utils = {
  onERC721Received: '0x150b7a02',
  onERC1155Received: '0xf23a6e61',
  onERC1155BatchReceived: '0xbc197c81',

  extractMetadataUri(metadataHex: string) {
    const metadataBytes = Buffer.from(metadataHex.substring(2), 'hex')
    return metadataBytes.toString('utf8')
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

  findLogsByName: (txReceipt: TransactionReceipt, name: string, abi: any) => {
    try {
      const eventTopicHash = abi
        .filter((item: any) => item.type === 'event' && item.name === name)
        .map((event: any) => new Interface(abi).getEvent(event.name)?.topicHash)[0]

      const log = txReceipt.logs.find((log: any) => log.topics[0] === eventTopicHash)
      if (log) {
        return {
          parsed: new Interface(abi).parseLog(log),
          txLog: log,
        }
      }
      return null
    } catch (e) {
      return null
    }
  },
}

export default Web3Utils
