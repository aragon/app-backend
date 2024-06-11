import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import config from '@config'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import { DaoTvl } from '@services/aragon-rates/daoTvl'

const llo = logger.logMeta.bind(null, { service: 'service:RatesService' })

const RatesService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async function () {
    logger.info('RatesService service sync start', llo({}))

    const taskFetchRates = [async () => FetchRates.start()]
    const taskUpdateDaoTvl = [async () => DaoTvl.start()]

    const taskOptions = {
      fn: () => [taskFetchRates, taskUpdateDaoTvl],
      interval: config.SERVICES.ARAGON_RATES.RATES_INTERVAL,
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

export default RatesService
