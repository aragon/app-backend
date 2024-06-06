import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { LogPluginSetupProcessor } from '@services/aragon-indexer/logPluginSetupProcessor'
import { LogPluginSetting } from '@services/aragon-indexer/logPluginSetting'
import { LogPluginRepoRegistry } from '@services/aragon-indexer/logPluginRepoRegistry'
import { LogDaoRegistry } from '@services/aragon-indexer/logDaoRegistry'
import { LogMember } from '@services/aragon-indexer/logMember'
import { LogDao } from '@services/aragon-indexer/logDao'
import { LogProposal } from '@services/aragon-indexer/logProposal'
import { AggregatorPlugin } from '@services/aragon-indexer/aggregator/plugin'
import { AggregatorMembers } from '@services/aragon-indexer/aggregator/member'
import { AggregatorSetting } from '@services/aragon-indexer/aggregator/setting'
import { AggregatorAssets } from '@services/aragon-indexer/aggregator/asset'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import config from '@config'
import { AggregatorTransactions } from '@services/aragon-indexer/aggregator/transaction'
import { AggregatorDao } from '@indexer/aggregator/dao'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

// Pipeline for the IndexerService service
const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async function () {
    logger.info('IndexerService service sync start', llo({}))

    const task0 = [async () => LogDaoRegistry.start()]
    const task1 = [
      async () => LogPluginRepoRegistry.start(),
      async () => LogPluginSetting.start(),
      async () => LogPluginSetupProcessor.start(),
      async () => LogProposal.start(),
    ]
    const task2 = [async () => LogMember.start(), async () => LogDao.start()]
    const task3 = [
      async () => AggregatorPlugin.start(),
      async () => AggregatorMembers.start(),
      async () => AggregatorSetting.start(),
      async () => AggregatorAssets.start(),
    ]
    const task4 = [async () => AggregatorDao.start()]
    const task5 = [async () => AggregatorTransactions.start()]

    const taskOptions = {
      fn: () => [task0, task1, task2, task3, task4, task5],
      interval: config.SERVICES.ARAGON_INDEXER.DAO_INTERVAL,
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
