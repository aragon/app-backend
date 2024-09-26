import { Interface, type Log } from 'ethers'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IEnumIndexerService, type IEventConfig, type IIndexerConfig, type NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { retryRequest } from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'
import { BlockHandler } from '@indexer/handlers/blockHandler'

const llo = logger.logMeta.bind(null, { service: 'modules:EventListener' })

class EventListener {
  public network: NetworksEnum
  public name: IEnumIndexerService
  public abi: any[]
  public listen: IEventConfig[]
  public networkName: NetworksEnum

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

  async start(crawl = false, listen = false, listenToBlocks = false) {
    const eventTopics = this.getEventTopics()
    const filter = { topics: eventTopics }

    if (crawl) {
      await this.crawl(filter)
    }
    if (listen) {
      this.listenToEvents(filter)
    }
    if (listenToBlocks) {
      this.listenToNewBlocks()
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
      const modifiedFilter = { ...filter, topics: [topicSubset] }

      this.setupSubscription(modifiedFilter)
    }
  }

  private subscribeWithoutTopics(filter: any) {
    this.setupSubscription(filter)
  }

  private setupSubscription(filter: any) {
    try {
      ProviderModule.subscribeToEvent(this.networkName, filter, this.processLog.bind(this))
      logger.verbose('Start real-time listening', llo({ networkName: this.networkName, filter }))
    } catch (error) {
      logger.error('Event listener error', llo({ error, name: this.name, network: this.networkName }))
    }
  }

  private listenToNewBlocks() {
    const provider = ProviderModule.getProvider(this.networkName)
    if (!provider) {
      logger.error('Provider not available for network', llo({ network: this.networkName }))
      return
    }

    provider.on('block', async (blockNumber: number) => {
      try {
        const block = await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(this.networkName)!.schedule(async () => provider.getBlock(blockNumber)),
        )
        await BlockHandler.processNewBlock(block, this.networkName)
      } catch (error) {
        logger.warn('Error fetching block data', llo({ network: this.networkName, blockNumber, error }))
      }
    })

    logger.verbose('Listening to new block events', llo({ network: this.networkName }))
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
}

export default EventListener
