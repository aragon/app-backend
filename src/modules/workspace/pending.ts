import SafeController from '@api/controllers/safe'
import { Models } from '@dbModels'
import { SafeReadError } from '@modules/safe/safeError'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import type { IWorkspaceAccountRef, IWorkspaceCoverage, IWorkspacePendingDecision } from '@src/types/workspace'
import {
  type HexAddress,
  type IProposalExtraParams,
  ISafeErrorCode,
  ISettingStatus,
  VotingBodyBrandIdentity,
} from '@types'
import { mapLimit } from 'async'

// One upstream page per Safe. A larger queue is reported as partial coverage rather than paged,
// because the queue mutates between reads and cannot be merged with the Mongo page reliably.
const SAFE_QUEUE_LIMIT = 50

type Process = { account: IWorkspaceAccountRef; pluginAddress: HexAddress }
type GovernanceSafe = { safe: IWorkspaceAccountRef; processes: Process[] }
type PendingRead = { coverage: IWorkspaceCoverage; decisions: IWorkspacePendingDecision[] }

async function readSafeQueue(account: IWorkspaceAccountRef, via?: IWorkspaceAccountRef): Promise<PendingRead> {
  const coverage: IWorkspaceCoverage = {
    account,
    resource: 'proposals',
    source: 'safe',
    status: 'available',
    ...(via && { via }),
  }
  try {
    const queue = await SafeController.getQueue(account.network, account.address, SAFE_QUEUE_LIMIT, 0)
    return {
      coverage: { ...coverage, status: queue.next ? 'partial' : 'available', ...(queue.meta.stale && { stale: true }) },
      decisions: queue.results.map(transaction => ({
        source: 'safe',
        id: `${account.network}:${account.address}:${transaction.safeTxHash}`,
        network: account.network,
        account,
        status: 'pending',
        submittedAt: Math.floor(new Date(transaction.submissionDate).getTime() / 1000),
        transaction,
      })),
    }
  } catch (error) {
    if (!SafeReadError.isSafeReadError(error)) throw error
    const unsupported = [ISafeErrorCode.notFound, ISafeErrorCode.unsupportedChain].includes(error.code)
    return {
      coverage: {
        ...coverage,
        status: unsupported ? 'unsupported' : 'unavailable',
        error: { code: error.code, ...(error.retryAfter !== undefined && { retryAfter: error.retryAfter }) },
      },
      decisions: [],
    }
  }
}

// Safes that take part in a selected DAO's processes: SPP stage bodies branded as a Safe, and Safes
// holding proposal-creation permission. Their queues hold unrelated work too, so only transactions
// addressed to the process plugin count as decisions of the DAO.
async function findGovernanceSafes(daos: IWorkspaceAccountRef[]): Promise<GovernanceSafe[]> {
  if (daos.length === 0) return []
  const settings = await Models.Setting.find(
    {
      ...WorkspaceAccountScope.filter(daos),
      status: ISettingStatus.active,
      $or: [{ 'stages.plugins.brandId': VotingBodyBrandIdentity.SAFE }, { 'externalProposers.0': { $exists: true } }],
    },
    { network: 1, daoAddress: 1, pluginAddress: 1, 'stages.plugins': 1, externalProposers: 1 },
  ).lean()

  const safes = new Map<string, GovernanceSafe>()
  for (const setting of settings) {
    const process: Process = {
      account: { network: setting.network, address: setting.daoAddress },
      pluginAddress: setting.pluginAddress,
    }
    const bodies = (setting.stages ?? []).flatMap(stage =>
      (stage.plugins ?? [])
        .filter(plugin => plugin.brandId === VotingBodyBrandIdentity.SAFE && plugin.address)
        .map(plugin => plugin.address),
    )
    const proposers = (setting.externalProposers ?? []).map(proposer => proposer.address).filter(Boolean)
    for (const address of [...bodies, ...proposers]) {
      const safe = { network: setting.network, address }
      const key = WorkspaceAccountScope.key(safe)
      const existing: GovernanceSafe = safes.get(key) ?? { safe, processes: [] }
      existing.processes.push(process)
      safes.set(key, existing)
    }
  }
  return [...safes.values()]
}

async function readGovernanceSafe({ safe, processes }: GovernanceSafe): Promise<PendingRead> {
  const read = await readSafeQueue(safe, processes[0].account)
  const decisions = read.decisions.flatMap(decision => {
    const via = processes.find(process => process.pluginAddress.toLowerCase() === decision.transaction.to.toLowerCase())
    return via ? [{ ...decision, via }] : []
  })
  return { coverage: read.coverage, decisions }
}

function matchesFilters(decision: IWorkspacePendingDecision, filters: IProposalExtraParams): boolean {
  if (filters.isExecuted === true || filters.isSubProposal === true) return false
  if (filters.pluginAddress) {
    const plugin = filters.pluginAddress.toLowerCase()
    const targets = [decision.account.address, decision.via?.pluginAddress].map(address => address?.toLowerCase())
    if (!targets.includes(plugin)) return false
  }
  if (filters.creatorAddress && filters.creatorAddress.toLowerCase() !== decision.transaction.from?.toLowerCase()) {
    return false
  }
  return true
}

const WorkspacePending = {
  // Selected accounts that are not indexed DAOs are read as Safes. Selected DAOs contribute the
  // queues of the Safes in their processes, unless that Safe is itself selected and read whole.
  async read(
    accounts: IWorkspaceAccountRef[],
    daoKeys: Set<string>,
    filters: IProposalExtraParams,
  ): Promise<{ coverage: IWorkspaceCoverage[]; pending: IWorkspacePendingDecision[] }> {
    const selected = new Set(accounts.map(WorkspaceAccountScope.key))
    const safes = accounts.filter(account => !daoKeys.has(WorkspaceAccountScope.key(account)))
    const daos = accounts.filter(account => daoKeys.has(WorkspaceAccountScope.key(account)))
    const governanceSafes = (await findGovernanceSafes(daos)).filter(
      item => !selected.has(WorkspaceAccountScope.key(item.safe)),
    )

    const [direct, related] = await Promise.all([
      // mapLimit only awaits functions declared async; a plain arrow returning a promise hangs it.
      mapLimit<IWorkspaceAccountRef, PendingRead>(safes, 4, async account => readSafeQueue(account)),
      mapLimit<GovernanceSafe, PendingRead>(governanceSafes, 4, readGovernanceSafe),
    ])
    const reads = [...direct, ...related]
    const pending = reads
      .flatMap(read => read.decisions)
      .filter(decision => matchesFilters(decision, filters))
      .sort((left, right) => right.submittedAt - left.submittedAt || left.id.localeCompare(right.id))
    return { coverage: reads.map(read => read.coverage), pending }
  },
}

export default WorkspacePending
