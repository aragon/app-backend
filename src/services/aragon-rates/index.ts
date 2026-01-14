import config from '@config'
import logger from '@logger'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import { RefreshScamTokens } from '@services/aragon-rates/refreshScamTokens'
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

    const scheduler = TaskSchedulerState.getInstance()

    // Fetch rates task
    const ratesTaskOptions = {
      fn: () => [
        [{ fetchRates: FetchRates }],
        [{ enaValidator: EnsValidator }],
        [{ refreshScamTokens: RefreshScamTokens }],
      ],
      interval: config.SERVICES.ARAGON_RATES.RATES_INTERVAL,
      runNow: true,
      stopOnError: false,
      onError: (error: any) => {
        logger.error('RatesService task error', llo({ error }))
      },
    }
    await scheduler.startTask('rates', ratesTaskOptions)

    logger.info('RatesService service sync end', llo({}))
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('rates')
    scheduler.stopTask('refreshScamTokens')

    logger.info('RatesService service stopped', llo({}))
  },
}

export default AragonRatesService
