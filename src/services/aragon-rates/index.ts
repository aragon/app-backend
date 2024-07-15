import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import config from '@config'
import { EnsMember } from '@rates/ensMember'
import { FetchRates } from '@services/aragon-rates/fetchRates'
import { DaoTvl } from '@services/aragon-rates/daoTvl'
import { DaoAssets } from '@rates/daoAsset'
import { DaoTransactions } from '@rates/daoTransaction'

const llo = logger.logMeta.bind(null, { service: 'service:RatesService' })

const RatesService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async function () {
    logger.info('RatesService service sync start', llo({}))

    const tasks = [
      [
        async () => EnsMember.start(),
        async () => FetchRates.start(),
        async () => DaoTvl.start(),
        async () => DaoAssets.start(),
        async () => DaoTransactions.start(),
      ],
    ]

    const taskOptions = {
      fn: () => [...tasks],
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
