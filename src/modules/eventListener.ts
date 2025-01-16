import { Interface, type Log } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IIndexerConfig, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'modules:EventListener' })

class EventListener {
  public network: NetworksEnum
  public configLogs: IIndexerConfig[]
  public maxTopicsPerBatch = 4
  public isProcessingBlock = 0

  constructor(network: NetworksEnum, configLogs: IIndexerConfig[]) {
    this.network = network
    this.configLogs = configLogs
  }

  async subscribeToEvents() {
    const topics = this.configLogs.map(config => config.topic).filter(topic => topic)

    if (topics.length === 0) {
      logger.error('No topics available for subscription', llo({ network: this.network }))
      return
    }

    const topicChunks: string[][] = []
    for (let i = 0; i < topics.length; i += this.maxTopicsPerBatch) {
      topicChunks.push(topics.slice(i, i + this.maxTopicsPerBatch))
    }

    await Promise.all(
      topicChunks.map(async (topicSubset: string[]) => {
        const filter: { topics: string[][] } = { topics: [topicSubset] }
        return new Promise((resolve, reject) => {
          try {
            ProviderModule.subscribeToEvent(this.network, filter, this.handleEvent.bind(this))
            logger.verbose('Start real-time listening', llo({ network: this.network, filter }))
          } catch (error) {
            logger.error('Event listener error', llo({ error, network: this.network, filter }))
          }
          resolve(null)
        })
      }),
    )
  }

  async handleEvent(txLog: Log) {
    const eventConfig = this.configLogs.find(item => item.topic === txLog.topics[0])
    if (!eventConfig) return

    const iFace = new Interface(eventConfig.abi)
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) return

    const info = Web3Helper.parseInfoLog(txLog, event.name, this.network)
    await eventConfig.handler(event, info)
  }

  subscribeEventsByNewBlock() {
    logger.verbose('Start real-time listening', llo({ network: this.network }))
    ProviderModule.subscribeToNewBlock(this.network, this.handleOnNewBlock.bind(this))
  }

  async handleOnNewBlock(blockNumber: number) {
    if (this.isProcessingBlock === blockNumber) {
      logger.verbose('Skipping block as another process is ongoing', llo({ blockNumber, network: this.network }))
      return
    }

    this.isProcessingBlock = blockNumber

    try {
      const provider = ProviderModule.getProvider(this.network)
      const blockHex = '0x' + Number(blockNumber).toString(16)

      const filter = {
        fromBlock: blockHex,
        toBlock: blockHex,
      }

      const logs = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(this.network)!.schedule(async () => provider.getLogs(filter)),
      )

      if (!logs || logs.length === 0) {
        return
      }

      const priorityTopics = this.configLogs.map(config => config.topic)
      const sortedLogs = logs
        .filter((log: Log) => priorityTopics.includes(log.topics[0]))
        .sort((a: Log, b: Log) => priorityTopics.indexOf(a.topics[0]) - priorityTopics.indexOf(b.topics[0]))

      if (sortedLogs.length === 0) {
        logger.silly('No logs found for topics', llo({ blockNumber, network: this.network }))
        return
      }

      for (const log of sortedLogs) {
        await this.handleEvent(log)
      }
    } finally {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingConfig = await Models.ConfigIndexer.findExistingLog({
          network: this.network,
          service: `indexer-${this.network}`,
        }, { session })

        await existingConfig.update({ lastSync: blockNumber }, { session })

        await session.commitTransaction()
        await session.endSession()

        logger.verbose('update last block', llo({ blockNumber, network: this.network }))
      })
      this.isProcessingBlock = 0
    }
  }
}

export default EventListener
