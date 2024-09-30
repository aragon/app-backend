import Runner from '@modules/runner'
import logger from '@logger'
import ManualSyncDaoAssets from '@tools/manualSyncDaoAssets'
import ManualSyncDaoTransactions from '@tools/manualSyncDaoTransactions'
import ManualSyncPluginEvents from '@tools/manualSyncPluginEvents'
import ManualSyncProposals from '@tools/manualSyncProposals'
import ManualSyncTokens from '@tools/manualSyncTokens'
import ManualSyncProposalAction from '@tools/manualSyncProposalAction'

const { TOOL_RUN } = process.env
const llo = logger.logMeta.bind(null, { TOOL_RUN })

const runners = {
  ManualSyncDaoAssets,
  ManualSyncDaoTransactions,
  ManualSyncPluginEvents,
  ManualSyncProposals,
  ManualSyncTokens,
  ManualSyncProposalAction,
}

const appToRun = runners[TOOL_RUN!]
logger.info('Tool started', llo({ appToRun: TOOL_RUN }))

Runner([{ app: appToRun }])
