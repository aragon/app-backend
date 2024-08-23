import { Interface, type Log } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IEnumIndexerService, type IIndexerConfig, type IEventConfig, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

class EventListener {
  public name: IEnumIndexerService
  public abi: any[]
  public listen: IEventConfig[]
  public networkName: NetworksEnum
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
      .filter(listener => listener.enableHistorical || listener.enableRealtime)
      .map(listener => iface.getEvent(listener.event)?.topicHash)
  }

  private getInterface() {
    return new Interface(this.abi)
  }

  async start(crawl = true, listen = true) {
    const eventTopics = this.getEventTopics()
    const filter = { topics: eventTopics }

    if (crawl) {
      await this.crawl(filter)
    }
    if (listen) {
      this.listenToEvents(filter)
    }
  }

  private async crawl(filter: any) {
    const crawler = new BlockchainLogCrawler({
      network: this.networkName,
      filter,
      onLog: async (txLog: Log) => this.processLog(txLog),
      onError: async (error: any) => this.processError(error),
      logService: this.name,
      stopOnError: true,
    })

    await crawler.crawl()
    logger.verbose(`End ${this.name} historical processing`, { networkName: this.networkName })
  }

  private listenToEvents(filter: any) {
    this.provider.on(filter, async (txLog: Log) => this.processLog(txLog))
    logger.verbose(`Start ${this.name} real-time listening`, { networkName: this.networkName })
  }

  private async processLog(txLog: Log) {
    const iFace = this.getInterface()
    const event = Web3Helper.parseLog(txLog, iFace)
    if (!event) return

    const info = Web3Helper.parseInfoLog(txLog, event.name, this.networkName)

    const listener = this.listen.find(listener => listener.event === event.name)

    if (
      listener &&
      ((listener.enableHistorical && listener.enableRealtime) || listener.enableHistorical || listener.enableRealtime)
    ) {
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
