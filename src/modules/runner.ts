/* istanbul ignore file */
import { TooBusyMonitor } from '@helpers/monitoring'
import { type IService } from '@types'
import logger from '@logger'
import Connections from './connections'
import { PrometheusStore } from '@modules/prometheusStore'

const llo = logger.logMeta.bind(null, { service: 'runner' })

let stopping = false
let prometheusStore: PrometheusStore | null = null

export async function stopApp(app: IService, code: number, timeToKill = 20 * 1000) {
  setTimeout(() => {
    if (typeof code !== 'number') code = 1
    process.exit(code) // eslint-disable-line no-process-exit
  }, timeToKill) // Force exit after timeout

  if (stopping) return
  stopping = true

  logger.info('Exiting...')
  logger.purge()

  try {
    // Handle both sync and async stop methods
    if (prometheusStore) {
      await prometheusStore.stop()
    }
    await Promise.resolve(app.stop())
    await Connections.close()
    process.exit(code) // eslint-disable-line no-process-exit
  } catch (error) {
    logger.error('global error', llo({ error }))
    process.exit(code) // eslint-disable-line no-process-exit
  }
}

async function runApp(app: IService) {
  try {
    process.on('exit', () => {
      stopApp(app, -1)
    })
    process.on('SIGINT', () => {
      stopApp(app, -1)
    })
    process.on('SIGTERM', () => {
      stopApp(app, -1)
    })

    process.on('unhandledRejection', error => {
      logger.error('Unhandled Promise Rejection', llo({ error }))
      stopApp(app, -1)
    })

    process.on('uncaughtException', error => {
      logger.error('Unhandled Exception', llo({ error }))
      stopApp(app, -1)
    })

    // Get connections needed by this service
    const neededConnections = app.NEED_CONNECTIONS || []

    logger.info(
      'Starting service',
      llo({
        service: app.name,
        connections: neededConnections,
        options: app.options,
      }),
    )

    // Open connections with service-specific options
    await Connections.open(neededConnections, app.options)

    // Start the service
    await app.start()

    if(app.name) {
      prometheusStore = PrometheusStore.getInstance(app.name)
      await prometheusStore.start()
    }

    logger.info(
      'Service started successfully',
      llo({
        service: app.name,
      }),
    )
  } catch (error) {
    logger.error('Unable to start application', llo({ error }))
    logger.purge()

    setTimeout(() => {
      process.exit(-1) // eslint-disable-line no-process-exit
    }, 1000)
  }
}

function Runner(app: IService) {
  if (!app) throw new Error('Service instance required')

  new TooBusyMonitor().init()
  runApp(app).catch(error => logger.error('run error', llo({ error })))
}

export default Runner
