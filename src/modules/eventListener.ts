import { Interface, type Log } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IIndexerConfig, type NetworksEnum } from '@types'

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

    if (eventConfig && eventConfig.enableRealtime) {
      await eventConfig.handler(event, info)
    } else {
      logger.warn(`No handler found for event: ${event.name}`, llo({ event, network: this.network }))
    }
  }

  subscribeEventsByNewBlock() {
    const provider = ProviderModule.getCoreProvider(this.network)

    provider.on('block', async (blockNumber: number) => {
      await this.handleOnNewBlock(blockNumber)
    })
  }

  async handleOnNewBlock(blockNumber: number) {
    if (this.isProcessingBlock === blockNumber) {
      logger.verbose('Skipping block as another process is ongoing', llo({ blockNumber, network: this.network }))
      return
    }

    this.isProcessingBlock = blockNumber
    try {
      const provider = ProviderModule.getCoreProvider(this.network)
      const transactionReceipt = await provider.send('eth_getBlockReceipts', ['0x' + Number(blockNumber).toString(16)])

      if (!transactionReceipt) {
        logger.warn('No transaction receipt found', llo({ blockNumber, network: this.network }))
        return
      }

      const priorityTopics = this.configLogs.map(config => config.topic)
      const logs = transactionReceipt.map((tx: any) => tx.logs).flat()
      const sortedLogs = logs
        .filter((log: Log) => priorityTopics.includes(log.topics[0]))
        .sort((a: Log, b: Log) => priorityTopics.indexOf(a.topics[0]) - priorityTopics.indexOf(b.topics[0]))

      if (sortedLogs.length === 0) {
        logger.verbose('No logs found for topics', llo({ blockNumber, network: this.network }))
        return
      }

      for (const log of sortedLogs) {
        await this.handleEvent(log)
      }
    } finally {
      this.isProcessingBlock = 0
    }
  }
}

export default EventListener
