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

const govTokenInterface = new Interface(GovernanceERC20.abi)
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

const TransferCrawler = {
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),
  timestampsCache: {},

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

      const deduplicatedLogs = this._deduplicateTransferLogs(logs, network)

      logger.info(
        'Starting mixed events processing with address sharding',
        llo({
          network,
          totalLogs: logs.length,
        }),
      )

      this.timestampsCache = await this._collectTimestamps(deduplicatedLogs, network)

      for (const log of deduplicatedLogs) {
        await this._processEventLog(log, network, {})
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

  _deduplicateTransferLogs(logs: Log[], network: NetworksEnum): Log[] {
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

    logger.info(
      'Deduplication completed',
      llo({
        originalLogs: logs.length,
        finalLogs: result.length,
        duplicatesRemoved,
        reduction: `${Math.round((duplicatesRemoved / logs.length) * 100)}%`,
        network,
      }),
    )

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
  async _processEventLog(log: Log, network: NetworksEnum, info: any = {}): Promise<void> {
    try {
      if (log.topics[0] === transferTopic) {
        await this._processTransferLog(log, network, info)
      } else if (log.topics[0] === delegateVotesChangedTopic) {
        await this._processDelegateVotesChangedLog(log, network, info)
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
    const governanceEventNames = Object.values(IGovernanceErc20Logs)
    const abi = GovernanceERC20.abi.filter(
      (item: any) => item.type === 'event' && governanceEventNames.includes(item.name as IGovernanceErc20Logs),
    )

    const erc721abi = ERC721.abi.filter(
      (item: any) => item.type === 'event' && item.name === IGovernanceErc20Logs.Transfer,
    )

    const iFace = new Interface([...abi, ...erc721abi])
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
  async _processTransferLog(log: Log, network: NetworksEnum, _info: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)
      if (!event || !info) {
        return
      }

      const startTime = Date.now()

      await GovernanceErc20Handler.transfer(event, info, false, this.timestampsCache)

      logger.verbose(
        'Processing transfer',
        llo({
          ..._info,
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
  async _processDelegateVotesChangedLog(log: Log, network: NetworksEnum, _info: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)

      if (!event || !info) {
        return
      }

      const startTime = Date.now()

      await GovernanceErc20Handler.delegateVotesChanged(event, info, false, this.timestampsCache)

      logger.verbose(
        'Processing delegate votes changed',
        llo({
          ..._info,
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
