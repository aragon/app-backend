import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { LogPluginSetupProcessor } from '@services/indexer/logPluginSetupProcessor'
import { LogPluginSetting } from '@services/indexer/logPluginSetting'
import { LogPluginRepoRegistry } from '@services/indexer/logPluginRepoRegistry'
import { LogDaoRegistry } from '@services/indexer/logDaoRegistry'
import { LogMember } from '@services/indexer/logMember'
import { LogDao } from '@services/indexer/logDao'
import { LogProposal } from '@services/indexer/logProposal'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import config from '@config'
import {AggregatorPlugin} from '@services/indexer/aggregator/plugin';
import {InitialData} from "../../../initialData";

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async function () {
    logger.info('IndexerService service sync start', llo({}))

    const task1 = [
      async () => LogPluginRepoRegistry.start(),
      async () => LogDaoRegistry.start()
    ]
    const task2 = [
      async () => LogPluginSetupProcessor.start(), async () => LogPluginSetting.start()
    ]
    const task3 = [
      // async () => LogMember.start(),
      // async () => LogProposal.start(),
      // async () => LogDao.start(),
    ]
    const task4 = [
      // async () => AggregatorPlugin.start()
    ]

    const taskOptions = {
      fn: () => [task1, task2, task3, task4],
      interval: config.SERVICES.SYNC_DATA.DAO_INTERVAL,
      onError: (error: any) => {
        logger.error('IndexerService task error', llo({ error }))
      },
    }

    const scheduler = TaskSchedulerState.getInstance()
    await scheduler.startTask('indexer', taskOptions)

    logger.info('IndexerService service sync end', llo({}))
  },

  async stop() {
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopTask('indexer')

    logger.info('IndexerService service stopped', llo({}))
  },
}

export default IndexerService
