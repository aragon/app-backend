import { Interface, type Log, type WebSocketProvider } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IEnumIndexerService, type IEventConfig, type IIndexerConfig, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

const llo = logger.logMeta.bind(null, { service: 'modules:EventListener' })

class EventListener {
  public network: NetworksEnum
  public name: IEnumIndexerService
  public abi: any[]
  public listen: IEventConfig[]
  public networkName: NetworksEnum
  private listeningActive: boolean = false
  private eventEmitterSetup: boolean = false

  constructor(config: Omit<IIndexerConfig, 'network'> & { networkName: NetworksEnum }) {
    this.name = config.name
    this.abi = config.abi
    this.listen = config.listen
    this.networkName = config.networkName
    this.network = config.networkName
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
      if (!this.eventEmitterSetup) {
        this.handleReconnections(filter)
        this.eventEmitterSetup = true
      }
    }
  }

  private handleReconnections(filter: any) {
    ProviderModule.eventEmitter.on('connected', network => {
      if (this.listeningActive && network === this.networkName) {
        this.listenToEvents(filter)
        logger.info('Resubscribed to events', llo({ filter, network: this.networkName }))
      }
    })
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
    const topics = filter.topics || []
    if (topics.length > 0) {
      this.subscribeWithTopics(filter, topics)
    } else {
      this.subscribeWithoutTopics(filter)
    }
  }

  private subscribeWithTopics(filter: any, topics: string[]) {
    const maxTopicsPerBatch = 4

    for (let i = 0; i < topics.length; i += maxTopicsPerBatch) {
      const topicSubset = topics.slice(i, i + maxTopicsPerBatch)
      const modifiedFilter = { ...filter, topics: topicSubset }

      this.setupSubscription(modifiedFilter)
    }
  }

  private subscribeWithoutTopics(filter: any) {
    this.setupSubscription(filter)
  }

  private setupSubscription(filter: any) {
    try {
      this.getProvider().on(filter, async (txLog: Log) => this.processLog(txLog))
      logger.verbose('Start real-time listening', llo({ networkName: this.networkName, filter }))
      this.listeningActive = true
    } catch (error) {
      logger.error('Event listener error', llo({ error, name: this.name, network: this.networkName }))
    }
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
    logger.error(
      `Error in ${this.name}`,
      llo({
        error,
        network: this.networkName,
      }),
    )
  }

  private getProvider(): WebSocketProvider {
    return ProviderModule.getProvider(this.network)!
  }
}

export default EventListener
