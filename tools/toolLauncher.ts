import Runner from '@modules/runner'
import logger from '@logger'
import SyncDaoAssets from '@tools/syncDaoAssets'
import SyncPluginEvents from '@tools/syncPluginEvents'
import SyncTokens from '@tools/syncTokens'
import SyncProposalAction from '@tools/syncProposalAction'
import SyncProposalType from '@tools/syncProposalType'
import SyncProposalTotalSupply from '@tools/syncProposalTotalSupply'
import RevertDbAtBlock from '@tools/revertDbAtBlock'
import SyncProposalIndex from '@tools/syncProposalIndex'
import MemberMetrics from '@tools/memberMetrics'
import EnsFetch from '@tools/ensFetch'
import FixSettingIssue from '@tools/fixBrokenPluginSetting'
import CleanDb from '@tools/cleanDb'
import ManualSyncToken from '@tools/fixTokenRate'
import FixMissingVotes from '@tools/fixMissingVotes'
import RefetchProposalsMetrics from '@tools/refetchProposalMetrics'
import SyncNectorDao from '@tools/syncNectar'
import RefetchDaoMetrics from '@tools/refetchDaoMetrics'
import IntegrityToolMemberCheck from '@tools/integrityCheck/memberCheck'
import IntegrityToolProposalCheck from '@tools/integrityCheck/proposalCheck'
import SyncMemberVP from '@tools/syncMemberVP'
import ToolsManualSyncMultisigV2Settings from '@tools/syncMultisigV2Settings'
import ToolsMissingSlugs from '@tools/missingSlugs'
import CreateAdminToken from '@tools/createAdminToken'
import Queue from '@tools/queue'
import FixProposalResult from '@tools/fixProposalResult'
import { AddSafeWalletSetting } from '@tools/addSafeWalletSetting'
import { FixEnsOnDao } from '@tools/fixEnsOnDao'
import { ToolsFixBrokenTx } from '@tools/fixBrokenTx'
import ToolsVeGovernance from '@tools/veGovernance'
import FixSppPair from '@tools/fixSppPair'
import { CleanUpTasks } from '@tools/cleanUpTasks'
import { IntegrityToolMemberTransaction } from '@tools/integrityCheck/memberTransaction'

const { TOOL_RUN } = process.env
const llo = logger.logMeta.bind(null, { TOOL_RUN })

const runners = {
  IntegrityToolMemberTransaction,
  ToolsVeGovernance,
  Queue,
  SyncMemberVP,
  CleanDb,
  EnsFetch,
  MemberMetrics,
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
}

const appToRun = runners[TOOL_RUN!]
logger.info('Tool started', llo({ appToRun: TOOL_RUN }))

Runner(appToRun)
