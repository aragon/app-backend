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
import { AggregatorDao } from '@indexer/aggregator/dao'
import { AggregatorDelegate } from '@indexer/aggregator/delegate'
import { AggregatorVote } from '@indexer/aggregator/vote'

const llo = logger.logMeta.bind(null, { service: 'service:IndexerService' })

// Pipeline for the IndexerService service
const IndexerService: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async function () {
    logger.info('IndexerService service sync start', llo({}))

    // order is important
    const logFastTasks = [
      // [{ logPluginRepoRegistry: LogPluginRepoRegistry }, { logDaoRegistry: LogDaoRegistry }],
      // [{ logPluginSetupProcessor: LogPluginSetupProcessor }, { logDao: LogDao }],
      // [{ logProposal: LogProposal }, { logPluginSetting: LogPluginSetting }],
      // [{ logMember: LogMember }],
    ]

    // order is important
    const aggregatorTasks = [
      // [{ aggregatorPlugin: AggregatorPlugin }, { aggregatorSetting: AggregatorSetting }],
      // [{ aggregatorDelegate: AggregatorDelegate }, { aggregatorVote: AggregatorVote }],
      // [{ aggregatorMembers: AggregatorMembers }], // run after plugin and delegate for metrics
      // [{ aggregatorDao: AggregatorDao }], // run after plugin and members
      [{ aggregatorProposal: AggregatorProposal }], // run after member
    ]

    const taskOptions = {
      fn: () => [...logFastTasks, ...aggregatorTasks],
      interval: config.SERVICES.ARAGON_INDEXER.DAO_INTERVAL,
      runNow: true,
      stopOnError: false,
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
