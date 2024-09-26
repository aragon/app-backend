import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import ConfigIndexer from '@indexer/configIndexer'
import EventListener from '@modules/eventListener'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

export interface IExtendedService extends IService {
  initializeEventListeners: (networks: any[]) => EventListener[]
  startRealtimeListeners: (eventListeners: EventListener[]) => Promise<void>
}

const IndexerService: IExtendedService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async function () {
    logger.info('IndexerService started', llo({}))

    const networks = NetworkHelper.supportedNetworks()
    const eventListeners: EventListener[] = IndexerService.initializeEventListeners(networks)

    // fetch realtime data
    await IndexerService.startRealtimeListeners(eventListeners)
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

  // Start all real-time listeners
  async startRealtimeListeners(eventListeners: EventListener[]) {
    const realtimeListeners = eventListeners.filter(listener =>
      listener.listen.some(eventConfig => eventConfig.enableRealtime),
    )

    if (realtimeListeners.length > 0) {
      await Promise.all(
        realtimeListeners.map(async listener => listener.start(false, false, true)), // Start onBlock
      )
    }
  },
}

export default IndexerService
