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
import { pLimit } from 'plimit-lit'

const llo = logger.logMeta.bind(null, { service: 'module:TransferCrawler' })

// Interface for GovernanceERC20 events
// It is outside because creating a new Interface is expensive, and we want to reuse it

const govTokenInterface = new Interface(GovernanceERC20.abi)
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

const governanceEventNames = Object.values(IGovernanceErc20Logs)
const abi = GovernanceERC20.abi.filter(
  (item: any) => item.type === 'event' && governanceEventNames.includes(item.name as IGovernanceErc20Logs),
)

const CONCURRENCY = 5
const BATCH_SIZE = 100

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

  async _collectTimestamps(logs: Log[], network: NetworksEnum) {
    const blockNumbers = logs.map(log => log.blockNumber)
    const minBlock = Math.min(...blockNumbers)
    const maxBlock = Math.max(...blockNumbers)

    return await Web3Helper.getBlocksTimestamps(minBlock, maxBlock, network)
  },

  async parseAndProcessTransferLogs(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()

      for (let i = 0; i < logs.length; i += BATCH_SIZE) {
        const batch = logs.slice(i, i + BATCH_SIZE)
        const deduplicatedBatch = this._deduplicateTransferLogs(batch)

        if (deduplicatedBatch.length === 0) continue

        const timestampCache = await this._collectTimestamps(deduplicatedBatch, network)

        await this._processLogsConcurrently(deduplicatedBatch, network, timestampCache)

        logger.info(
          'Batch processed',
          llo({
            network,
            processed: Math.min(i + BATCH_SIZE, logs.length),
            total: logs.length,
            percentage: Math.round((Math.min(i + BATCH_SIZE, logs.length) / logs.length) * 100),
          }),
        )
      }

      const duration = Date.now() - startTime

      logger.info(
        'Events processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: logs.length,
        }),
      )
    } catch (error) {
      logger.error('Mixed events processing failed', llo({ network, error }))
      throw error
    }
  },

  async _processLogsConcurrently(logs: Log[], network: NetworksEnum, timestampCache: any) {
    const limit = pLimit(CONCURRENCY)

    const promises = logs.map(async log =>
      limit(async () => {
        try {
          await this._processEventLog(log, network, timestampCache)
        } catch (error: any) {
          logger.error(
            'Log processing failed in concurrent batch',
            llo({
              network,
              txHash: log.transactionHash,
              logIndex: log.index,
              error: error.message,
            }),
          )
        }
      }),
    )

    await Promise.all(promises)
  },

  _deduplicateTransferLogs(logs: Log[]): Log[] {
    const transferMap = new Map<string, Log>()
    const nonTransferLogs: Log[] = []

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

        const transferKey = ethers.id(`${log.address.toLowerCase()}:${from.toLowerCase()}->${to.toLowerCase()}`)

        const existingLog = transferMap.get(transferKey)

        if (!existingLog || this._isLogLater(log, existingLog)) {
          transferMap.set(transferKey, log)
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

    return result
  },

  /**
   * Compare which log is later (higher block, tx index, log index)
   */
  _isLogLater(logA: Log, logB: Log): boolean {
    if (logA.blockNumber !== logB.blockNumber) {
      return logA.blockNumber > logB.blockNumber
    }
    if (logA.transactionIndex !== logB.transactionIndex) {
      return logA.transactionIndex > logB.transactionIndex
    }
    return logA.index > logB.index
  },

  /**
   * Process individual event log based on type
   */
  async _processEventLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    try {
      if (log.topics[0] === transferTopic) {
        await this._processTransferLog(log, network, timestampCache)
      } else if (log.topics[0] === delegateVotesChangedTopic) {
        await this._processDelegateVotesChangedLog(log, network, timestampCache)
      }
    } catch (error) {
      logger.error(
        'Event log processing failed',
        llo({
          network,
          eventType: log.topics[0] === transferTopic ? 'Transfer' : 'DelegateVotesChanged',
          txHash: log.transactionHash,
          logIndex: log.index,
          error,
        }),
      )
      throw error
    }
  },

  _parseLogArguments: (log: Log, network: NetworksEnum) => {
    const decoded = Web3Utils.parseLog(log, iFace)
    const iLogInfo = Web3Utils.parseInfoLog(log, decoded?.name!, network)

    return {
      event: decoded,
      info: iLogInfo,
    }
  },

  /**
   * Process Transfer event log
   */
  async _processTransferLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)
      if (!event || !info) {
        return
      }

      const startTime = Date.now()

      await GovernanceErc20Handler.transfer(event, info, false, timestampCache)

      logger.verbose(
        'Processing transfer',
        llo({
          network,
          tokenAddress: info.address,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          timeTaken: Date.now() - startTime,
        }),
      )
    } catch (error) {
      logger.error(
        'Transfer processing failed',
        llo({
          network,
          txHash: log.transactionHash,
          logIndex: log.index,
          error,
        }),
      )
      throw error
    }
  },

  /**
   * Process DelegateVotesChanged event log
   */
  async _processDelegateVotesChangedLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)

      if (!event || !info) {
        return
      }

      const startTime = Date.now()

      await GovernanceErc20Handler.delegateVotesChanged(event, info, false, timestampCache)

      logger.verbose(
        'Processing delegate votes changed',
        llo({
          network,
          tokenAddress: log.address,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          timeTaken: Date.now() - startTime,
        }),
      )
    } catch (error) {
      logger.error(
        'DelegateVotesChanged processing failed',
        llo({
          network,
          txHash: log.transactionHash,
          logIndex: log.index,
          error,
        }),
      )
      throw error
    }
  },
}

export default TransferCrawler
