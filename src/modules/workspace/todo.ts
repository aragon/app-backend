/**
 * What a wallet can still act on across the accounts of a workspace: the active proposals it can
 * vote on and has not voted on, and the live Safe transactions it owns a signature on and has not
 * confirmed. Everything is answered from stored rows, so a request costs a handful of indexed
 * queries plus one cached chain read per owned Safe.
 */

import SafeController from '@api/controllers/safe'
import { Models } from '@dbModels'
import SafeReadRequestModule from '@modules/safe/safeReadRequest'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import WorkspaceAccounts from '@modules/workspace/accounts'
import WorkspacePendingTransactions from '@modules/workspace/pendingTransactions'
import type { IWorkspaceAccountRef, IWorkspaceCoverage, IWorkspaceTodoTransaction } from '@src/types/workspace'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  type IProposalsResponse,
  type ISafeMultisigTransaction,
  type NetworksEnum,
} from '@types'
import { mapLimit } from 'async'

/** Rows per list. A to-do list is short by nature; a longer one is cut at the newest rows. */
export const WORKSPACE_TODO_LIMIT = 50

type VoteTarget = { network: NetworksEnum; pluginAddress: HexAddress; proposalIndex: string }
type Candidate = { proposal: IProposalsResponse; target: VoteTarget }
type TodoProposal = IProposalsResponse & {
  pluginInterfaceType?: string
  proposalIndex?: string
  stageIndex?: number | null
  settings: IProposalsResponse['settings'] & { stages?: Array<{ plugins?: Array<{ address: HexAddress }> }> }
  subProposals?: Array<{ pluginAddress: HexAddress; proposalIndex?: string; stageIndex?: number | null }>
}

const governanceKey = (network: NetworksEnum, address: string) => `${network}:${address.toLowerCase()}`

const WorkspaceTodo = {
  /**
   * The body plugins of the selected DAOs the member belongs to: the stored addresses, for the
   * proposal `$in`, and their network-qualified keys, for matching rows back.
   */
  async findMemberPlugins(
    daos: IWorkspaceAccountRef[],
    memberAddress: HexAddress,
  ): Promise<{ keys: Set<string>; addresses: HexAddress[] }> {
    if (daos.length === 0) return { keys: new Set(), addresses: [] }
    const rows = (await Models.PluginMember.find({ memberAddress, ...WorkspaceAccountScope.filter(daos) })
      .select('network pluginAddress')
      .lean()) as Array<{ network: NetworksEnum; pluginAddress: HexAddress }>
    return {
      keys: new Set(rows.map(row => governanceKey(row.network, row.pluginAddress))),
      addresses: [...new Set(rows.map(row => row.pluginAddress))],
    }
  },

  /** Installed process plugins of the selected DAOs. Their proposals are voted on through stage bodies. */
  async findProcessPlugins(daos: IWorkspaceAccountRef[]): Promise<HexAddress[]> {
    if (daos.length === 0) return []
    const rows = await Models.Plugin.find({
      ...WorkspaceAccountScope.filter(daos),
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
    })
      .select('address')
      .lean()
    return (rows as Array<{ address: HexAddress }>).map(row => row.address)
  },

  /**
   * The proposal, or stage sub-proposal, the member casts their vote on. Null when the member sits
   * in no body of it. The rows arrive inside their vote window already (`activeAt`), so a process
   * proposal is matched against the bodies of its current stage; a body without a sub-proposal (a
   * Safe) is skipped, its work being a Safe transaction.
   */
  voteTargetOf(proposal: TodoProposal, memberPlugins: Set<string>): VoteTarget | null {
    const { network } = proposal
    if (proposal.pluginInterfaceType !== IPluginInterfaceType.spp) {
      if (!memberPlugins.has(governanceKey(network, proposal.pluginAddress)) || proposal.proposalIndex == null) {
        return null
      }
      return { network, pluginAddress: proposal.pluginAddress, proposalIndex: proposal.proposalIndex }
    }

    const stageIndex = proposal.stageIndex ?? 0
    for (const body of proposal.settings.stages?.[stageIndex]?.plugins ?? []) {
      if (!memberPlugins.has(governanceKey(network, body.address))) continue
      const subProposal = (proposal.subProposals ?? []).find(
        item => item.stageIndex === stageIndex && item.pluginAddress.toLowerCase() === body.address.toLowerCase(),
      )
      if (subProposal?.proposalIndex != null) {
        return { network, pluginAddress: subProposal.pluginAddress, proposalIndex: subProposal.proposalIndex }
      }
    }
    return null
  },

  async readProposals(
    daos: IWorkspaceAccountRef[],
    memberAddress: HexAddress,
    now: number,
  ): Promise<IProposalsResponse[]> {
    const [memberPlugins, processPlugins] = await Promise.all([
      WorkspaceTodo.findMemberPlugins(daos, memberAddress),
      WorkspaceTodo.findProcessPlugins(daos),
    ])
    // No membership means no vote anywhere, process proposals included: their bodies are plugins too.
    if (memberPlugins.addresses.length === 0) return []

    const { data } = await Models.Proposal.findWithPagination({
      accounts: daos,
      extraParams: {
        daoInfo: true,
        isExecuted: false,
        isSubProposal: false,
        activeAt: now,
        pluginAddresses: [...new Set([...memberPlugins.addresses, ...processPlugins])],
      },
      // Newest first, as every other proposal list: a process proposal has no end date to rank by.
      paginationParams: { page: 1, pageSize: WORKSPACE_TODO_LIMIT, sort: 'blockTimestamp', order: 'desc' },
    })

    const candidates: Candidate[] = []
    for (const proposal of data as TodoProposal[]) {
      const target = WorkspaceTodo.voteTargetOf(proposal, memberPlugins.keys)
      if (target) candidates.push({ proposal, target })
    }
    if (candidates.length === 0) return []

    const votes = await Models.Vote.find({
      memberAddress,
      $or: candidates.map(({ target }) => target),
    })
      .select('network pluginAddress proposalIndex')
      .lean()
    const voted = new Set(votes.map(vote => `${governanceKey(vote.network, vote.pluginAddress)}:${vote.proposalIndex}`))

    return candidates
      .filter(
        ({ target }) => !voted.has(`${governanceKey(target.network, target.pluginAddress)}:${target.proposalIndex}`),
      )
      .map(({ proposal }) => proposal)
  },

  /** The Safe side, for the accounts that are not indexed DAOs. */
  async readTransactions(
    accounts: IWorkspaceAccountRef[],
    memberAddress: HexAddress,
  ): Promise<{ transactions: IWorkspaceTodoTransaction[]; coverage: IWorkspaceCoverage[] }> {
    if (accounts.length === 0) return { transactions: [], coverage: [] }
    const { coverage: tracking, stale, tracked } = await WorkspacePendingTransactions.coverage(accounts)
    const coverage = tracking.map(item => ({ ...item, resource: 'todo' as const }))
    if (tracked.length === 0) return { transactions: [], coverage }

    const ownerRows = await Models.SafeMember.find({
      memberAddress,
      ...WorkspaceAccountScope.filter(tracked, 'safeAddress'),
    })
      .select('network safeAddress')
      .lean()
    const ownedKeys = new Set(ownerRows.map(row => governanceKey(row.network, row.safeAddress)))
    const owned = tracked.filter(account => ownedKeys.has(WorkspaceAccountScope.key(account)))
    for (const account of stale) {
      if (ownedKeys.has(WorkspaceAccountScope.key(account)))
        SafeTransactionsModule.queuePull(account.network, account.address)
    }

    const [rows, infos] = await Promise.all([
      SafeTransactionsModule.listLive(owned),
      mapLimit<IWorkspaceAccountRef, [string, IWorkspaceTodoTransaction['safe']]>(owned, 4, async account => {
        try {
          const { nonce, threshold, version } = await SafeController.getInfo(account.network, account.address)
          return [WorkspaceAccountScope.key(account), { nonce, threshold, version }]
        } catch (error) {
          if (!SafeReadRequestModule.getError(error)) throw error
          return [WorkspaceAccountScope.key(account), null]
        }
      }),
    ])
    const safeInfos = new Map(infos)

    const nonceCounts = new Map<string, number>()
    for (const row of rows) {
      const key = `${governanceKey(row.network, row.safeAddress)}:${row.nonce}`
      nonceCounts.set(key, (nonceCounts.get(key) ?? 0) + 1)
    }

    const member = memberAddress.toLowerCase()
    const order = new Map(owned.map((account, index) => [WorkspaceAccountScope.key(account), index]))
    const transactions = rows
      .filter(row => !row.confirmations.some(confirmation => confirmation.owner.toLowerCase() === member))
      .sort((left, right) => {
        const leftKey = governanceKey(left.network, left.safeAddress)
        const rightKey = governanceKey(right.network, right.safeAddress)
        if (leftKey !== rightKey) return (order.get(leftKey) ?? 0) - (order.get(rightKey) ?? 0)
        const byNonce = BigInt(left.nonce) < BigInt(right.nonce) ? -1 : BigInt(left.nonce) > BigInt(right.nonce) ? 1 : 0
        return byNonce || left.safeTxHash.localeCompare(right.safeTxHash)
      })
      .slice(0, WORKSPACE_TODO_LIMIT)
      .map(({ id, network, safeAddress, ...transaction }) => {
        const key = governanceKey(network, safeAddress)
        return {
          id,
          account: { network, address: safeAddress },
          safe: safeInfos.get(key) ?? null,
          hasNonceRival: (nonceCounts.get(`${key}:${transaction.nonce}`) ?? 0) > 1,
          transaction: transaction as ISafeMultisigTransaction,
        }
      })

    return { transactions, coverage }
  },

  async read(accounts: IWorkspaceAccountRef[], memberAddress: HexAddress) {
    const daoKeys = await WorkspaceAccounts.findDaos(accounts)
    const isDao = (account: IWorkspaceAccountRef) => daoKeys.has(WorkspaceAccountScope.key(account))
    const [proposals, safes] = await Promise.all([
      WorkspaceTodo.readProposals(accounts.filter(isDao), memberAddress, Math.floor(Date.now() / 1000)),
      WorkspaceTodo.readTransactions(
        accounts.filter(account => !isDao(account)),
        memberAddress,
      ),
    ])
    // An indexed DAO is always readable; the Safe side reports its own tracking and freshness.
    const safeCoverage = new Map(safes.coverage.map(item => [WorkspaceAccountScope.key(item.account), item]))
    const coverage: IWorkspaceCoverage[] = accounts.map(
      account =>
        safeCoverage.get(WorkspaceAccountScope.key(account)) ?? {
          account,
          resource: 'todo',
          source: 'index',
          status: 'available',
        },
    )
    return {
      proposals,
      transactions: safes.transactions,
      coverage,
      partial: coverage.some(item => item.status !== 'available'),
    }
  },
}

export default WorkspaceTodo
