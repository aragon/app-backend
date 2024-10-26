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

  constructor(network: NetworksEnum, configLogs: IIndexerConfig[]) {
    this.network = network
    this.configLogs = configLogs
  }

  subscribeToEvents() {
    const topics = this.configLogs.map(config => config.topic).filter(topic => topic)

    if (topics.length === 0) {
      logger.error('No topics available for subscription', llo({ network: this.network }))
      return
    }

    const topicChunks: string[][] = []
    for (let i = 0; i < topics.length; i += this.maxTopicsPerBatch) {
      topicChunks.push(topics.slice(i, i + this.maxTopicsPerBatch))
    }

    for (const topicSubset of topicChunks) {
      const filter: { topics: string[][] } = { topics: [topicSubset] }
      try {
        ProviderModule.subscribeToEvent(this.network, filter, this.handleEvent.bind(this))
        logger.verbose('Start real-time listening', llo({ network: this.network, filter }))
      } catch (error) {
        logger.error('Event listener error', llo({ error, network: this.network, filter }))
      }
    }
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
}

export default EventListener
