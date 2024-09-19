import Runner from '@modules/runner'
import logger from '@logger'
import ManualSyncDaoAssets from '@tools/manualSyncDaoAssets'
import ManualSyncTokens from '@tools/manualSyncTokens'
import ManualSyncDaoTransactions from '@tools/manualSyncDaoTransactions'

const { TOOL_RUN } = process.env
const llo = logger.logMeta.bind(null, { TOOL_RUN })

const runners = {
  ManualSyncDaoAssets,
  ManualSyncDaoTransactions,
  ManualSyncTokens,
}

const appToRun = runners[TOOL_RUN!]
logger.info('Tool started', llo({ appToRun: TOOL_RUN }))

Runner([{ app: appToRun }])
