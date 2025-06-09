import { ethers, Interface, type Log } from 'ethers'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import logger from '@logger'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, type NetworksEnum } from '@types'
import PoolingCrawler from '@modules/poolingCrawler'
import { ERC721 } from '@artifacts/ERC721'
import Web3Utils from '@src/helpers/web3Utils'
import configIndexer from '@indexer/configIndexer'
import config from '@config'
import { BatchTransfersHandler } from './batchTransfersHandler'
import Web3BatchHelper from '@helpers/web3BatchHelper'

const llo = logger.logMeta.bind(null, { service: 'module:TransferCrawler' })

const iFace = init()

const BATCH_SIZE = config.TRANSFER_CRAWLER_CONFIG.BATCH_SIZE

function init() {
  const governanceEventNames = Object.values(IGovernanceErc20Logs)

  const abi = GovernanceERC20.abi.filter(
    (item: any) => item.type === 'event' && governanceEventNames.includes(item.name as IGovernanceErc20Logs),
  )

  const erc721abi = ERC721.abi.filter(
    (item: any) => item.type === 'event' && item.name === IGovernanceErc20Logs.Transfer,
  )
  return new Interface([...abi, ...erc721abi])
}

const TransferCrawler = {
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),

  async start({ logService, network }: { logService: any; network: NetworksEnum }) {
    try {
      if (this.instances.has(network)) {
        return this.instances.get(network)!.crawl()
      }

      const transferLogs = configIndexer.filter(config =>
        Object.values(IGovernanceErc20Logs).includes(config.event as IGovernanceErc20Logs),
      )

      const transferCrawler = new BlockchainLogCrawler({
        network,
        events: transferLogs,
        onError: async (error: any) => logger.error('Error Transfer Crawler', llo({ network, error })),
        logService,
        stopOnError: true,
        batchSize: 0.05,
        skipLogProcessing: true,
        filterLogs: async (logs: Log[]) => {
          const filteredLogs = await PoolingCrawler.filterLogs(logs, network)
          if (filteredLogs.length === 0) return []
          await this.parseAndProcessTransferLogs(filteredLogs, network)
          return filteredLogs
        },
      })

      this.instances.set(network, transferCrawler)
      return transferCrawler.crawl()
    } catch (error) {
      logger.error('TransferCrawler start', llo({ network, error }))
    }
  },

  async parseAndProcessTransferLogs(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()

      const blockNumbers = logs.map(log => log.blockNumber)

      const logsByToken = this._groupLogsByToken(logs)
      logger.info(
        'Processing transfer logs by token',
        llo({
          network,
          totalLogs: logs.length,
          uniqueTokens: Object.keys(logsByToken).length,
          from: Math.min(...blockNumbers),
          to: Math.max(...blockNumbers),
        }),
      )

      const tokenAddresses = Object.keys(logsByToken)

      await Promise.all(
        tokenAddresses.map(async tokenAddress => {
          const processor = new BatchTransfersHandler(network, ethers.getAddress(tokenAddress))
          return this._processTokenBatch(processor, logsByToken[tokenAddress], network)
        }),
      )

      const duration = Date.now() - startTime
      logger.info(
        'Events processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: logs.length,
          tokensProcessed: tokenAddresses.length,
          logsPerSecond: Math.round(logs.length / (duration / 1000)),
          from: Math.min(...blockNumbers),
          to: Math.max(...blockNumbers),
        }),
      )
    } catch (error) {
      logger.error('Mixed events processing failed', llo({ network, error }))
      throw error
    }
  },

  /**
   * Group logs by token address
   * @param logs Array of logs to group
   * @returns Object mapping token addresses to their logs
   */
  _groupLogsByToken(logs: Log[]): Record<string, Log[]> {
    const result: Record<string, Log[]> = {}

    for (const log of logs) {
      const tokenAddress = log.address.toLowerCase()
      if (!result[tokenAddress]) {
        result[tokenAddress] = []
      }
      result[tokenAddress].push(log)
    }

    return result
  },

  /**
   * Process all logs for a specific token in batches
   * @param processor BatchTransfersHandler instance to process events
   * @param logs Array of logs for this token
   * @param network Network enum
   */
  async _processTokenBatch(processor: BatchTransfersHandler, logs: Log[], network: NetworksEnum) {
    try {
      logs.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
        if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
        return a.index - b.index
      })

      const parsedEvents = logs
        .map(log => {
          const { event, info } = this._parseLogArguments(log, network)
          if (!event || !info) return null
          return { log: event, info }
        })
        .filter(Boolean)

      if (parsedEvents.length === 0) {
        return
      }

      for (let i = 0; i < parsedEvents.length; i += BATCH_SIZE) {
        const batch: any = parsedEvents.slice(i, i + BATCH_SIZE)

        if (batch.length === 0) continue

        const startBlock = batch[0].info.blockNumber
        const endBlock = batch[batch.length - 1].info.blockNumber

        const timestamps = await Web3BatchHelper.getBlocksTimestamps(startBlock, endBlock, network)
        processor.setTimestampCache(timestamps)

        await processor.processEvents(batch)
      }

      logger.info(
        'Token processing completed',
        llo({
          network,
          tokenAddress: processor.tokenAddress,
          logCount: logs.length,
        }),
      )
    } catch (error) {
      logger.error(
        'Error processing token batch',
        llo({
          error,
          network,
          tokenAddress: processor.tokenAddress,
          logCount: logs.length,
        }),
      )
    }
  },

  /**
   * Parse log arguments and return event and info
   * @param log Log to parse
   * @param network Network enum
   * @returns Parsed event and info
   */
  _parseLogArguments: (log: Log, network: NetworksEnum) => {
    const decoded = Web3Utils.parseLog(log, iFace)
    const iLogInfo = Web3Utils.parseInfoLog(log, decoded?.name!, network)

    return {
      event: decoded,
      info: iLogInfo,
    }
  },
}

export default TransferCrawler
