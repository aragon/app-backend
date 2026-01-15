import config from '@config'
import logger from '@logger'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import { EnsValidator } from '@services/aragon-rates/handlers/ensValidator'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { EnumConnection, EnumServiceName, type IService } from '@types'

const llo = logger.logMeta.bind(null, { service: 'service:RatesService' })

const AragonRatesService: IService = {
  name: EnumServiceName.ARAGON_RATES,
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],
  options: { mongoSync: config.MONGO_DB.SYNC_MODELS },

  start: async function () {
    logger.info('RatesService service sync start', llo({}))

    const tasks = [[{ fetchRates: FetchRates }], [{ ensValidator: EnsValidator }]]

    const taskOptions = {
      fn: () => [...tasks],
      interval: config.SERVICES.ARAGON_RATES.RATES_INTERVAL,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        logger.error('RatesService task error', llo({ error }))
      },
    }

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask('rates', taskOptions)

    logger.info('RatesService service sync end', llo({}))
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('rates')

    logger.info('RatesService service stopped', llo({}))
  },
}

export default AragonRatesService
