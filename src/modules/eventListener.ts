import { Interface, Log } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { IEnumIndexerService, IIndexerConfig, IEventConfig, NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

class EventListener {
  private readonly name: IEnumIndexerService
  private readonly abi: any[]
  private readonly listen: IEventConfig[]
  private readonly networkName: NetworksEnum
  private readonly provider: any

  constructor(config: Omit<IIndexerConfig, 'network'> & { networkName: NetworksEnum }) {
    this.name = config.name
    this.abi = config.abi
    this.listen = config.listen
    this.networkName = config.networkName
    this.provider = ProviderModule.getProvider(config.networkName)
  }

  private getEventTopics() {
    const iface = new Interface(this.abi)
    return this.listen
      .filter(listener => listener.enabled)
      .map(listener => iface.getEvent(listener.event)?.topicHash)
  }

  private getInterface() {
    return new Interface(this.abi)
  }

  async start() {
    const eventTopics = this.getEventTopics()
    const filter = { topics: eventTopics }

    await this.crawl(filter)
    this.listenToEvents(filter)
  }

  private async crawl(filter: any) {
    const crawler = new BlockchainLogCrawler({
      network: this.networkName,
      filter,
      onLog: (txLog: Log) => this.processLog(txLog),
      onError: (error: any) => this.processError(error),
      logService: this.name,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose(`End ${this.name}`, { networkName: this.networkName })
  }

  private listenToEvents(filter: any) {
    this.provider.on(filter, (txLog: Log) => this.processLog(txLog))
  }

  private async processLog(txLog: Log) {
    const iFace = this.getInterface()
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) return

    const info = Web3Helper.parseInfoLog(txLog, event.name, this.networkName)

    // Find the corresponding event handler
    const listener = this.listen.find(listener => listener.event === event.name && listener.enabled)

    if (listener) {
      await listener.handler(event, info)
    } else {
      logger.warn(`No handler found for event: ${event.name}`, { event, network: this.networkName })
    }
  }

  private async processError(error: any) {
    logger.error(`Error in ${this.name}`, {
      error,
      network: this.networkName,
    })
  }
}

export default EventListener
