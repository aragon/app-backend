import { ethers, Interface, type Log, type LogDescription } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import {
  EnumQueueName,
  type IIndexerConfig,
  IPluginInterfaceType,
  type IRealTimeConfig,
  type NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import DbTx from '@modules/dbTx'
import type Plugin from '@models/schema/plugin'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ERC721 } from '@artifacts/ERC721'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'modules:EventListener' })

class EventListenerV2 {
  public network: NetworksEnum
  public configLogs: IIndexerConfig[]
  private readonly latestBlockNumber: number | null = null
  private batchTimeout?: NodeJS.Timeout
  private isProcessing = false
  private readonly batchWindowMs: number
  private readonly processingTimeoutMs: number
  private failureCount = 0
  private readonly maxFailures: number
  private readonly circuitBreakerPauseMs: number
  private isPaused = false
  private pauseTimeout?: NodeJS.Timeout

  constructor(network: NetworksEnum, configLogs: IIndexerConfig[], options: IRealTimeConfig) {
    this.network = network
    this.configLogs = configLogs
    this.batchWindowMs = options.batchWindowMs
    this.processingTimeoutMs = options.processingTimeoutMs
    this.maxFailures = options.maxFailures
    this.circuitBreakerPauseMs = options.circuitBreakerPauseMs
  }

  async handleEvent(txLog: Log) {
    try {
      const eventConfig = this.configLogs.find(item => item.topic === txLog.topics[0])
      if (!eventConfig) return

      let parsedEvent: LogDescription | null = null
      let matchingHandler: any = null

      for (const configItem of eventConfig.config) {
        const iFace = new Interface(configItem.abi)
        try {
          parsedEvent = Web3Helper.parseLog(txLog, iFace)
          if (parsedEvent) {
            matchingHandler = configItem.handler
            break
          }
        } catch (_) {
          // skip
        }
      }

      if (!parsedEvent) return

      const info = Web3Helper.parseInfoLog(txLog, parsedEvent.name, this.network)
      await matchingHandler?.(parsedEvent, info)
    } catch (error) {
      logger.error('Error handling eventListener', llo({ error, network: this.network, txLog }))
    }
  }

  subscribeEventsByNewBlock() {
    logger.verbose('Start real-time listening with batching', llo({ network: this.network }))

    this.start()

    setInterval(() => {
      this.start()
    }, this.batchWindowMs)
  }

  async start() {
    if (this.isPaused) return
    const blockNumber = await Web3Helper.getBlockNumber('latest', this.network)
    const lastProcessedBlock = await this.getLastProcessedBlock()
    if (lastProcessedBlock && blockNumber > lastProcessedBlock) {
      await this.processLatestBlock(lastProcessedBlock + 1)
    }
  }

  private async pauseProcessing(duration: number) {
    this.isPaused = true
    logger.warn(
      'Pausing event processing',
      llo({
        network: this.network,
        durationMs: duration,
      }),
    )

    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout)
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = undefined
    }

    this.pauseTimeout = setTimeout(() => {
      this.isPaused = false
      this.failureCount = 0
      logger.info('Resuming event processing', llo({ network: this.network }))
    }, duration)
  }

  private async processLatestBlock(lastProcessedBlock: number) {
    if (this.isProcessing || this.isPaused) return

    this.isProcessing = true
    const startTime = Date.now()

    try {
      const timeoutPromise = new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('Block processing timeout')), this.processingTimeoutMs),
      )

      await Promise.race([this.processBlockLogic(lastProcessedBlock), timeoutPromise])

      this.failureCount = 0
    } catch (error) {
      this.failureCount++

      logger.error(
        'Block processing failed',
        llo({
          error,
          network: this.network,
          failureCount: this.failureCount,
          maxFailures: this.maxFailures,
          processingTime: Date.now() - startTime,
          blockNumber: lastProcessedBlock,
        }),
      )
      // Circuit breaker logic
      if (this.failureCount >= this.maxFailures) {
        await this.pauseProcessing(this.circuitBreakerPauseMs)
      }
    } finally {
      this.isProcessing = false
    }
  }

  private async processBlockLogic(lastProcessedBlock: number) {
    const startTime = Date.now()
    const provider = ProviderModule.getAnyRpcProvider(this.network)

    const logs = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(this.network).schedule(async () =>
        provider.getLogs({
          fromBlock: '0x' + lastProcessedBlock.toString(16),
          toBlock: 'latest',
        }),
      ),
    )

    if (!logs || logs.length === 0) return
    const filteredLogs = await this.filterUnwantedEvents(logs)
    const addresses = this.parseAddressForDeposits(filteredLogs)
    if (addresses?.length) {
      await RabbitMQHelper.sendMessage(EnumQueueName.realtimeTransactions, {
        id: `realtimeTransactions-${this.network}-${lastProcessedBlock}`,
        params: { addresses, network: this.network, transactionHash: logs[logs.length - 1].transactionHash },
      })
    }
    if (filteredLogs.length > 0) {
      await this.sortAndHandleLogs(lastProcessedBlock, lastProcessedBlock, filteredLogs)
    }

    await this.saveProgress(logs[logs.length - 1].blockNumber, this.network, startTime)
  }

  async sortAndHandleLogs(fromBlock: number, toBlock: number, filteredLogs: Log[]) {
    const startTime = Date.now()
    const sortedLogs = this.sortLogsByPriority(filteredLogs)
    for (const log of sortedLogs) {
      await this.handleEvent(log)
    }

    logger.verbose(
      'Processing logs Finished',
      llo({
        network: this.network,
        fromBlock,
        toBlock,
        totalTime: Date.now() - startTime,
        logCount: filteredLogs.length,
      }),
    )
  }

  private async getLastProcessedBlock(): Promise<number | null> {
    try {
      const existingConfig = await Models.ConfigIndexer.findExistingLog({
        network: this.network,
        service: `indexer-${this.network}`,
      })

      return existingConfig ? existingConfig.lastSync : null
    } catch (error) {
      logger.error('Error getting last processed block', llo({ error, network: this.network }))
      return null
    }
  }

  private async filterUnwantedEvents(logs: Log[]) {
    const plugins = await Models.Plugin.find({
      network: this.network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenAddress: { $ne: null },
    })

    const addressSet = new Set(plugins.map((plugin: Plugin) => ethers.getAddress(plugin.tokenAddress)))
    const transferTopic = ethers.id('Transfer(address,address,uint256)')

    return logs.filter(log => {
      if (log.topics[0] === transferTopic) {
        return addressSet.has(ethers.getAddress(log.address))
      }
      return true
    })
  }

  private sortLogsByPriority(logs: Log[]) {
    const priorityTopics = this.configLogs.map(config => config.topic)
    return logs.sort((a, b) => {
      const aIndex = priorityTopics.indexOf(a.topics[0])
      const bIndex = priorityTopics.indexOf(b.topics[0])
      if (aIndex === -1 && bIndex !== -1) return 1
      if (aIndex !== -1 && bIndex === -1) return -1
      return aIndex - bIndex
    })
  }

  async saveProgress(blockNumber: number, network: NetworksEnum, startTime: number) {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingConfig = await Models.ConfigIndexer.findExistingLog(
          {
            network,
            service: `indexer-${network}`,
          },
          { session },
        )

        if (!existingConfig || existingConfig.lastSync >= blockNumber) {
          return false
        }

        await existingConfig.update({ lastSync: blockNumber }, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('update last block', llo({ blockNumber, network, processingTime: Date.now() - startTime }))
      })
    } catch (error) {
      logger.error('Error saving progress - last block', llo({ error, blockNumber, network }))
    }
  }

  parseAddressForDeposits(logs: Log[]): string[] | undefined {
    const topicHash = [
      new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
      new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
    ]

    const logsToHandle = logs.filter((log: Log) => {
      return topicHash.includes(log.topics[0])
    })

    if (!logsToHandle || logsToHandle.length === 0) {
      return
    }

    const receiverAddresses = new Set<string>()
    for (const log of logsToHandle) {
      if (log.topics[0] === topicHash[0]) {
        receiverAddresses.add(log.address)
      } else if (log.topics[0] === topicHash[1]) {
        const decodedAddress = this.decodeTransferLogs(log)
        if (decodedAddress) {
          receiverAddresses.add(decodedAddress)
        }
      }
    }

    return Array.from(receiverAddresses)
  }

  private decodeTransferLogs(log: Log) {
    const govTokenInterface = new Interface(GovernanceERC20.abi)
    const erc721Interface = new Interface(ERC721.abi)
    let decoded: any = null
    try {
      decoded = govTokenInterface.parseLog(log)
    } catch (e) {
      try {
        decoded = erc721Interface.parseLog(log)
      } catch (e) {
        // skip
      }
    }
    return decoded ? decoded.args.to : null
  }
}

export default EventListenerV2
