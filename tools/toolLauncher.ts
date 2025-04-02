import Runner from '@modules/runner'
import logger from '@logger'
import ManualSyncDaoAssets from '@tools/manualSyncDaoAssets'
import ManualSyncDaoTransactions from '@tools/manualSyncDaoTransactions'
import ManualSyncPluginEvents from '@tools/manualSyncPluginEvents'
import ManualSyncProposals from '@tools/manualSyncProposals'
import ManualSyncTokens from '@tools/manualSyncTokens'
import ManualSyncProposalAction from '@tools/manualSyncProposalAction'
import ManualTrigger from '@tools/manualTrigger'
import ManualSyncProposalType from '@tools/manualSyncProposalType'
import ManualSyncProposalTotalSupply from '@tools/manualSyncProposalTotalSupply'
import ToolsRevertDbAtBlock from '@tools/revertDbAtBlock'
import ToolsManualSyncProposalIndex from '@tools/manualSyncProposalIndex'
import ToolsMemberMetrics from '@tools/memberMetrics'
import ToolsEnsFetch from '@tools/ensFetch'
import ToolsFixSettingIssue from '@tools/fixBrokenPluginSetting'
import ToolsCleanDb from '@tools/cleanDb'
import ToolsManualSyncToken from '@tools/manualFixTokenRate'
import ToolsFixMissingVotes from '@tools/fixMissingVotes'
import RefetchProposalsMetrics from '@tools/refetchProposalMetrics'
import ManualSyncNectorDao from '@tools/manualSyncNectar'
import RefetchDaoMetrics from '@tools/refetchDaoMetrics'
import IntegrityToolMemberCheck from '@tools/integrityCheck/memberCheck'
import IntegrityToolProposalCheck from '@tools/integrityCheck/proposalCheck'
import SyncMemberVP from '@tools/syncMemberVP'
import ToolsManualSyncMultisigV2Settings from '@tools/manualSyncMultisigV2Settings'
import ToolsMissingSlugs from '@tools/missingSlugs'
import CreateAdminToken from '@tools/createAdminToken'
import Queue from '@tools/queue'

const { TOOL_RUN } = process.env
const llo = logger.logMeta.bind(null, { TOOL_RUN })

const runners = {
  Queue,
  SyncMemberVP,
  ToolsCleanDb,
  ToolsEnsFetch,
  ToolsMemberMetrics,
  ToolsMissingSlugs,
  ToolsManualSyncMultisigV2Settings,
  ManualSyncProposalTotalSupply,
  ManualSyncDaoAssets,
  ManualSyncDaoTransactions,
  ManualSyncPluginEvents,
  ManualSyncProposals,
  ManualSyncTokens,
  ManualSyncProposalAction,
  ManualTrigger,
  ManualSyncProposalType,
  ToolsRevertDbAtBlock,
  ToolsManualSyncProposalIndex,
  ToolsFixSettingIssue,
  ToolsManualSyncToken,
  ToolsFixMissingVotes,
  RefetchProposalsMetrics,
  ManualSyncNectorDao,
  RefetchDaoMetrics,
  CreateAdminToken,
  IntegrityToolMemberCheck,
  IntegrityToolProposalCheck,
}

const appToRun = runners[TOOL_RUN!]
logger.info('Tool started', llo({ appToRun: TOOL_RUN }))

Runner([{ app: appToRun }])
