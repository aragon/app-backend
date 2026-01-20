import logger from '@logger'
import Runner from '@modules/runner'
import { AddSafeWalletSetting } from '@tools/addSafeWalletSetting'
import CleanDb from '@tools/cleanDb'
import { CleanUpTasks } from '@tools/cleanUpTasks'
import CreateAdminToken from '@tools/createAdminToken'
import { DaoTransaction } from '@tools/daoTransactions'
import EnsFetch from '@tools/ensFetch'
import FixSettingIssue from '@tools/fixBrokenPluginSetting'
import { ToolsFixBrokenTx } from '@tools/fixBrokenTx'
import { FixEnsOnDao } from '@tools/fixEnsOnDao'
import FixMissingVotes from '@tools/fixMissingVotes'
import FixProposalResult from '@tools/fixProposalResult'
import FixSppPair from '@tools/fixSppPair'
import ManualSyncToken from '@tools/fixTokenRate'
import IntegrityToolMemberCheck from '@tools/integrityCheck/memberCheck'
import IntegrityToolProposalCheck from '@tools/integrityCheck/proposalCheck'
import ToolsMissingSlugs from '@tools/missingSlugs'
import Queue from '@tools/queue'
import RefetchDaoMetrics from '@tools/refetchDaoMetrics'
import RefetchProposalsMetrics from '@tools/refetchProposalMetrics'
import RevertDbAtBlock from '@tools/revertDbAtBlock'
import SyncDaoAssets from '@tools/syncDaoAssets'
import SyncMemberVP from '@tools/syncMemberVP'
import ToolsManualSyncMultisigV2Settings from '@tools/syncMultisigV2Settings'
import SyncNectorDao from '@tools/syncNectar'
import SyncPluginEvents from '@tools/syncPluginEvents'
import SyncProposalAction from '@tools/syncProposalAction'
import SyncProposalIndex from '@tools/syncProposalIndex'
import SyncProposalTotalSupply from '@tools/syncProposalTotalSupply'
import SyncProposalType from '@tools/syncProposalType'
import SyncTokens from '@tools/syncTokens'
import UpdateTokenSpamFields from '@tools/updateTokenSpamFields'
import ToolsVeGovernance from '@tools/veGovernance'
import AnalyzeTokenSpamScores from '@tools/analyzeTokenSpamScores'

const { TOOL_RUN } = process.env
const llo = logger.logMeta.bind(null, { TOOL_RUN })

const runners = {
  DaoTransaction,
  ToolsVeGovernance,
  Queue,
  SyncMemberVP,
  CleanDb,
  EnsFetch,
  ToolsMissingSlugs,
  ToolsManualSyncMultisigV2Settings,
  SyncProposalTotalSupply,
  SyncDaoAssets,
  SyncPluginEvents,
  SyncTokens,
  SyncProposalAction,
  SyncProposalType,
  RevertDbAtBlock,
  SyncProposalIndex,
  FixSettingIssue,
  ManualSyncToken,
  FixMissingVotes,
  RefetchProposalsMetrics,
  SyncNectorDao,
  RefetchDaoMetrics,
  CreateAdminToken,
  IntegrityToolMemberCheck,
  IntegrityToolProposalCheck,
  FixProposalResult,
  AddSafeWalletSetting,
  FixEnsOnDao,
  ToolsFixBrokenTx,
  FixSppPair,
  CleanUpTasks,
  UpdateTokenSpamFields,
  AnalyzeTokenSpamScores,
}

const appToRun = runners[TOOL_RUN!]
logger.info('Tool started', llo({ appToRun: TOOL_RUN }))

Runner(appToRun)
