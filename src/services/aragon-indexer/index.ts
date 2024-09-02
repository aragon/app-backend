import logger from '@logger'
import { EnumConnection, IEnumIndexerService, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import ConfigIndexer from '@indexer/configIndexer'
import EventListener from '@modules/eventListener'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export interface IExtendedService extends IService {
  initializeEventListeners: (networks: any[]) => EventListener[]
  runCrawlersInOrder: (eventListeners: EventListener[], orderedServices: IEnumIndexerService[][]) => Promise<void>
  startRealtimeListeners: (eventListeners: EventListener[]) => Promise<void>
}

const IndexerService: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('IndexerService service sync start', llo({}))

    const networks = NetworkHelper.supportedNetworks() // Ensure async/await is used

    const orderedServices = [
      [IEnumIndexerService.logPluginRepoRegistry, IEnumIndexerService.logDaoRegistry],
      [IEnumIndexerService.logMetadata, IEnumIndexerService.logPluginSetupProcessor],
      [IEnumIndexerService.logTokenVoting],
      [IEnumIndexerService.logMultisig, IEnumIndexerService.logGovernanceErc20],
    ]

    const eventListeners: EventListener[] = IndexerService.initializeEventListeners(networks)

    await this.runCrawlersInOrder(eventListeners, orderedServices)
    await this.startRealtimeListeners(eventListeners)

    logger.info('IndexerService service sync end', llo({}))
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('IndexerService service stopped', llo({}))
  },

  // Initialize EventListeners based on the configuration
  initializeEventListeners(networks: any[]): EventListener[] {
    const eventListeners: EventListener[] = []

    for (const { networkName } of networks) {
      for (const config of ConfigIndexer) {
        if (config.enabled) {
          const listener = new EventListener({
            name: config.name,
            networkName,
            abi: config.abi,
            listen: config.listen,
          })
          eventListeners.push(listener)
        }
      }
    }

    return eventListeners
  },

  // Run all crawlers in the specified order
  async runCrawlersInOrder(eventListeners: EventListener[], orderedServices: IEnumIndexerService[][]) {
    for (const group of orderedServices) {
      const crawlers = eventListeners
        .filter(
          listener =>
            group.includes(listener.name) && listener.listen.some(eventConfig => eventConfig.enableHistorical),
        )
        .map(async listener => listener.start(true, false)) // Start crawler only

      if (crawlers.length > 0) {
        await Promise.all(crawlers)
      }
    }
  },

  // Start all real-time listeners
  async startRealtimeListeners(eventListeners: EventListener[]) {
    const realtimeListeners = eventListeners.filter(listener =>
      listener.listen.some(eventConfig => eventConfig.enableRealtime),
    )

    if (realtimeListeners.length > 0) {
      await Promise.all(
        realtimeListeners.map(async listener => listener.start(false, true)), // Start listener only
      )
    }
  },
}

export default IndexerService
