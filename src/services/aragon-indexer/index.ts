import config from '@config'
import logger from '@logger'
import { EnumConnection, type IService } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { LogPluginSetupProcessor } from '@services/aragon-indexer/logPluginSetupProcessor'
import { LogPluginSetting } from '@services/aragon-indexer/logPluginSetting'
import { LogPluginRepoRegistry } from '@services/aragon-indexer/logPluginRepoRegistry'
import { LogDaoRegistry } from '@services/aragon-indexer/logDaoRegistry'
import { LogMember } from '@services/aragon-indexer/logMember'
import { LogDao } from '@services/aragon-indexer/logDao'
import { LogProposal } from '@services/aragon-indexer/logProposal'
import { AggregatorProposal } from '@services/aragon-indexer/aggregator/proposal'
import { AggregatorPlugin } from '@services/aragon-indexer/aggregator/plugin'
import { AggregatorMembers } from '@services/aragon-indexer/aggregator/member'
import { AggregatorSetting } from '@services/aragon-indexer/aggregator/setting'
import { AggregatorAssets } from '@services/aragon-indexer/aggregator/asset'
import { AggregatorTransactions } from '@services/aragon-indexer/aggregator/transaction'
import { AggregatorDao } from '@indexer/aggregator/dao'
import { AggregatorDelegate } from '@indexer/aggregator/delegate'
import { AggregatorVote } from '@indexer/aggregator/vote'
import { AggregatorEnsMember } from '@indexer/aggregator/ensMember'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

// Pipeline for the IndexerService service
const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async function () {
    logger.info('IndexerService service sync start', llo({}))

    // const logTasks = [
    //   [async () => LogPluginRepoRegistry.start()],
    //   [async () => LogDaoRegistry.start()],
    //   [async () => LogPluginSetupProcessor.start()],
    //   [async () => LogDao.start()], // after logDaoRegistry
    //   [async () => LogPluginSetting.start()], // after logPluginSetupProcessor
    //   [async () => LogProposal.start()], // after logPluginSetupProcessor
    //   [async () => LogMember.start()], // after logPluginSetupProcessor
    // ]

    // order is important
    const logFastTasks = [
      [async () => LogPluginRepoRegistry.start(), async () => LogDaoRegistry.start()],
      [async () => LogPluginSetupProcessor.start(), async () => LogDao.start()], // after logDaoRegistry
      [async () => LogProposal.start(), async () => LogPluginSetting.start()], // after logPluginSetupProcessor
      [async () => LogMember.start()], // after logPluginSetupProcessor
    ]

    // order is important
    const aggregatorTasks = [
      [async () => AggregatorPlugin.start()],
      [async () => AggregatorSetting.start()],
      [async () => AggregatorMembers.start()], // run after plugin
      [async () => AggregatorProposal.start()],
      [async () => AggregatorDao.start()],
      [async () => AggregatorAssets.start()],
      [async () => AggregatorDelegate.start()],
      [async () => AggregatorVote.start()],
      [async () => AggregatorTransactions.start()],
      [async () => AggregatorEnsMember.start()],
    ]

    const taskOptions = {
      fn: () => [...logFastTasks, ...aggregatorTasks],
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
