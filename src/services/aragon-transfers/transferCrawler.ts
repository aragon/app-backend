import { ethers, Interface, type Log } from 'ethers'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import logger from '@logger'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, type NetworksEnum } from '@types'
import PoolingCrawler from '@modules/poolingCrawler'
import { ERC721 } from '@artifacts/ERC721'
import Web3Utils from '@src/helpers/web3Utils'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import configIndexer from '@indexer/configIndexer'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'module:TransferCrawler' })

// Interface for GovernanceERC20 events - REUSE THESE, DON'T RECREATE
const govTokenInterface = new Interface(GovernanceERC20.abi)
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

const governanceEventNames = Object.values(IGovernanceErc20Logs)
const abi = GovernanceERC20.abi.filter(
  (item: any) => item.type === 'event' && governanceEventNames.includes(item.name as IGovernanceErc20Logs),
)

const erc721abi = ERC721.abi.filter((item: any) => item.type === 'event' && item.name === IGovernanceErc20Logs.Transfer)
const iFace = new Interface([...abi, ...erc721abi])

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
        batchSize: 0.01,
        skipLogProcessing: true,
        filterLogs: async (logs: Log[]) => {
          const filteredLogs = await PoolingCrawler.filterLogs(logs, network)
          if (filteredLogs.length === 0) return []

          // Use the optimized version
          await this.parseAndProcessTransferLogsOptimized(filteredLogs, network)
          return filteredLogs
        },
      })

      this.instances.set(network, transferCrawler)
      return transferCrawler.crawl()
    } catch (error) {
      logger.error('TransferCrawler start', llo({ network, error }))
    }
  },

  async _collectTimestamps(logs: Log[], network: NetworksEnum) {
    const blockNumbers = logs.map(log => log.blockNumber)
    const minBlock = Math.min(...blockNumbers)
    const maxBlock = Math.max(...blockNumbers)

    return await Web3Helper.getBlocksTimestamps(minBlock, maxBlock, network)
  },

  async parseAndProcessTransferLogsOptimized(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()

      logger.info(
        'Starting memory-optimized sequential processing',
        llo({
          network,
          totalLogs: logs.length,
        }),
      )

      const CHUNK_SIZE = 20
      let processedCount = 0

      for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
        const chunk = logs.slice(i, i + CHUNK_SIZE)

        await this._processChunkSequentially(chunk, network)

        processedCount += chunk.length

        if (processedCount % 100 === 0) {
          if (global.gc) {
            global.gc()
          }

          if (processedCount % 200 === 0) {
            logger.info(
              'Processing progress',
              llo({
                network,
                processed: processedCount,
                total: logs.length,
                percentage: Math.round((processedCount / logs.length) * 100),
                memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
              }),
            )
          }
        }
      }

      const duration = Date.now() - startTime
      logger.info(
        'Optimized sequential processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: logs.length,
          avgTimePerLog: `${Math.round(duration / logs.length)}ms`,
        }),
      )
    } catch (error) {
      logger.error('Optimized sequential processing failed', llo({ network, error }))
      throw error
    }
  },

  async _processChunkSequentially(logs: Log[], network: NetworksEnum): Promise<void> {
    const deduplicatedLogs = this._deduplicateTransferLogs(logs, network)

    if (deduplicatedLogs.length === 0) return

    let timestampCache: any = null
    try {
      timestampCache = await this._collectTimestamps(deduplicatedLogs, network)
    } catch (error) {
      logger.error('Failed to collect timestamps for chunk', llo({ network, error }))
      return
    }

    for (let i = 0; i < deduplicatedLogs.length; i++) {
      const log = deduplicatedLogs[i]

      try {
        await this._processEventLog(log, network, timestampCache)
      } catch (error: any) {
        logger.error(
          'Log processing failed, continuing',
          llo({
            network,
            txHash: log.transactionHash,
            error: error.message,
          }),
        )
      }
    }

    timestampCache = null
  },

  _deduplicateTransferLogs(logs: Log[], network: NetworksEnum): Log[] {
    if (logs.length === 0) return []

    const transferMap = new Map<string, Log>()
    const nonTransferLogs: Log[] = []
    let duplicatesRemoved = 0

    for (const log of logs) {
      if (log.topics[0] !== transferTopic) {
        nonTransferLogs.push(log)
        continue
      }

      try {
        const from = log.topics[1] ? ethers.getAddress(`0x${log.topics[1].slice(-40)}`) : null
        const to = log.topics[2] ? ethers.getAddress(`0x${log.topics[2].slice(-40)}`) : null

        if (!from || !to) {
          nonTransferLogs.push(log)
          continue
        }

        const transferKey = `${log.address.toLowerCase()}:${from.toLowerCase()}->${to.toLowerCase()}`
        const existingLog = transferMap.get(transferKey)

        if (!existingLog || this._isLogLater(log, existingLog)) {
          if (existingLog) duplicatesRemoved++
          transferMap.set(transferKey, log)
        } else {
          duplicatesRemoved++
        }
      } catch (error) {
        nonTransferLogs.push(log)
      }
    }

    const result = [...Array.from(transferMap.values()), ...nonTransferLogs]
    result.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
      return a.index - b.index
    })

    // Only log deduplication for larger chunks
    if (logs.length > 50) {
      logger.verbose(
        'Chunk deduplication',
        llo({
          originalLogs: logs.length,
          finalLogs: result.length,
          duplicatesRemoved,
          network,
        }),
      )
    }

    return result
  },

  _isLogLater(logA: Log, logB: Log): boolean {
    if (logA.blockNumber !== logB.blockNumber) {
      return logA.blockNumber > logB.blockNumber
    }
    if (logA.transactionIndex !== logB.transactionIndex) {
      return logA.transactionIndex > logB.transactionIndex
    }
    return logA.index > logB.index
  },

  async _processEventLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    if (log.topics[0] === transferTopic) {
      await this._processTransferLog(log, network, timestampCache)
    } else if (log.topics[0] === delegateVotesChangedTopic) {
      await this._processDelegateVotesChangedLog(log, network, timestampCache)
    }
  },

  _parseLogArguments: (log: Log, network: NetworksEnum) => {
    try {
      const decoded = Web3Utils.parseLog(log, iFace)
      const iLogInfo = Web3Utils.parseInfoLog(log, decoded?.name!, network)

      return {
        event: decoded,
        info: iLogInfo,
      }
    } catch (error) {
      logger.error('Log parsing failed', llo({ network, txHash: log.transactionHash, error }))
      return { event: null, info: null }
    }
  },

  async _processTransferLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    const { event, info } = this._parseLogArguments(log, network)
    if (!event || !info) return

    await GovernanceErc20Handler.transfer(event, info, false, timestampCache)
  },

  async _processDelegateVotesChangedLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    const { event, info } = this._parseLogArguments(log, network)
    if (!event || !info) return

    await GovernanceErc20Handler.delegateVotesChanged(event, info, false, timestampCache)
  },
}

export default TransferCrawler
