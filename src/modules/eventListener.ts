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

  async subscribeToEvents() {
    const topics = this.configLogs.map(config => config.topic).filter(topic => topic)

    if (topics.length === 0) {
      logger.error('No topics available for subscription', llo({ network: this.network }))
      return
    }

    const filter = { topics: [topics] }

    for (let i = 0; i < topics.length; i += this.maxTopicsPerBatch) {
      const topicSubset = topics.slice(i, i + this.maxTopicsPerBatch)
      const modifiedFilter = { ...filter, topics: [topicSubset] }

      ProviderModule.subscribeToEvent(this.network, modifiedFilter, this.handleEvent.bind(this))
      logger.verbose('Start real-time listening', llo({ network: this.network, filter: modifiedFilter }))
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
