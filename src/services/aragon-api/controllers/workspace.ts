import SafeController from '@api/controllers/safe'
import { Models } from '@dbModels'
import type Transaction from '@models/schema/transaction'
import { SafeReadError } from '@modules/safe/safeError'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import WorkspaceAccounts from '@modules/workspace/accounts'
import WorkspaceMembers from '@modules/workspace/members'
import WorkspacePending from '@modules/workspace/pending'
import type {
  IWorkspaceAccount,
  IWorkspaceAccountRef,
  IWorkspaceCoverage,
  IWorkspaceMember,
  IWorkspaceQuery,
} from '@src/types/workspace'
import {
  type IAssetExtraParams,
  type IProposalExtraParams,
  ISafeErrorCode,
  type ITransactionExtraParams,
  ITransactionType,
} from '@types'
import { mapLimit } from 'async'

function queryScope(query: IWorkspaceQuery<{ network?: IWorkspaceAccountRef['network'] }>) {
  return WorkspaceAccountScope.normalize(query.accounts).filter(
    account => !query.filters.network || account.network === query.filters.network,
  )
}

const WorkspaceController = {
  async getAccounts({
    accounts: rawAccounts,
  }: {
    accounts: IWorkspaceAccountRef[]
  }): Promise<{ data: IWorkspaceAccount[] }> {
    const accounts = WorkspaceAccountScope.normalize(rawAccounts)
    const daos = await WorkspaceAccounts.findDaos(accounts)
    const data = await mapLimit<IWorkspaceAccountRef, IWorkspaceAccount>(accounts, 4, async account => {
      const dao = daos.get(WorkspaceAccountScope.key(account))
      if (dao) return { ...account, type: 'dao', status: 'available', indexed: true, name: dao.name ?? null }

      try {
        const safe = await SafeController.getInfo(account.network, account.address)
        return { ...account, type: 'safe', status: 'available', indexed: false, safe }
      } catch (error) {
        if (!SafeReadError.isSafeReadError(error)) throw error
        return {
          ...account,
          type: 'unknown',
          status: [ISafeErrorCode.notFound, ISafeErrorCode.unsupportedChain].includes(error.code)
            ? 'unsupported'
            : 'unavailable',
          indexed: false,
          error: { code: error.code, retryAfter: error.retryAfter },
        }
      }
    })
    return { data }
  },

  async getAssets(query: IWorkspaceQuery<IAssetExtraParams>) {
    const accounts = queryScope(query)
    const [result, coverage] = await Promise.all([
      Models.Asset.findWithPagination({ accounts, extraParams: query.filters, paginationParams: query.pagination }),
      WorkspaceAccounts.coverage(accounts, 'assets'),
    ])
    return { ...result, coverage, partial: coverage.some(item => item.status !== 'available') }
  },

  async getTransactions(query: IWorkspaceQuery<ITransactionExtraParams>) {
    const accounts = queryScope(query)
    const selected = new Set(accounts.map(WorkspaceAccountScope.key))
    const [result, coverage] = await Promise.all([
      Models.Transaction.findWithPagination({
        accounts,
        extraParams: query.filters,
        paginationParams: query.pagination,
      }),
      WorkspaceAccounts.coverage(accounts, 'transactions'),
    ])
    const data = result.data.map((transaction: Transaction) => ({
      ...transaction.filterKeys(),
      id: transaction.id,
      account: { network: transaction.network, address: transaction.daoAddress },
      // Preserve account activity rows; event-level merging needs native-transfer identity as well.
      internal:
        transaction.type !== ITransactionType.execution &&
        selected.has(WorkspaceAccountScope.key({ network: transaction.network, address: transaction.fromAddress })) &&
        selected.has(WorkspaceAccountScope.key({ network: transaction.network, address: transaction.toAddress })),
    }))
    return { ...result, data, coverage, partial: coverage.some(item => item.status !== 'available') }
  },

  // Indexed proposals are the paginated `data`; queued Safe transactions of selected Safes come back
  // whole in `pending`, because the Safe queue cannot take part in the Mongo page.
  async getProposals(query: IWorkspaceQuery<IProposalExtraParams>) {
    const accounts = queryScope(query)
    const daoKeys = new Set((await WorkspaceAccounts.findDaos(accounts)).keys())
    const [result, safes] = await Promise.all([
      Models.Proposal.findWithPagination({
        accounts,
        extraParams: { ...query.filters, daoInfo: true },
        paginationParams: query.pagination,
      }),
      WorkspacePending.read(accounts, daoKeys, query.filters),
    ])
    const safeCoverage = new Map(
      safes.coverage.filter(item => !item.via).map(item => [WorkspaceAccountScope.key(item.account), item]),
    )
    const coverage: IWorkspaceCoverage[] = [
      ...accounts.map(
        account =>
          safeCoverage.get(WorkspaceAccountScope.key(account)) ?? {
            account,
            resource: 'proposals' as const,
            source: 'index' as const,
            status: 'available' as const,
          },
      ),
      // Safes reached through a selected DAO's process are listed after the selection itself.
      ...safes.coverage.filter(item => item.via),
    ]
    return { ...result, pending: safes.pending, coverage, partial: coverage.some(item => item.status !== 'available') }
  },

  async getMembers(
    query: IWorkspaceQuery<{
      network?: IWorkspaceAccountRef['network']
      memberAddress?: string
      role?: 'member' | 'owner'
    }>,
  ) {
    const accounts = queryScope(query)
    const resolved = (await WorkspaceController.getAccounts({ accounts })).data
    const { data: rawData, failedDaoKeys, truncatedDaoKeys } = await WorkspaceMembers.read(accounts, resolved)
    const search = query.pagination.search?.toLowerCase()
    const memberAddress = query.filters.memberAddress?.toLowerCase()
    const filtered = rawData
      .map(member => ({
        ...member,
        memberships: query.filters.role
          ? member.memberships.filter(membership => membership.role === query.filters.role)
          : member.memberships,
      }))
      .filter(member => member.memberships.length > 0)
      .filter(member => !memberAddress || member.address.toLowerCase() === memberAddress)
      .filter(
        member =>
          !search || member.address.toLowerCase().includes(search) || member.ens?.toLowerCase().includes(search),
      )
      .sort((left, right) => {
        const compared = `${left.network}:${left.address.toLowerCase()}`.localeCompare(
          `${right.network}:${right.address.toLowerCase()}`,
        )
        return query.pagination.order === 'desc' ? -compared : compared
      })

    const pageSize = query.pagination.pageSize ?? 10
    const page = query.pagination.page ?? 1
    const start = (page - 1) * pageSize
    const data = filtered.slice(start, start + pageSize) as IWorkspaceMember[]
    const coverage = resolved.map(account => {
      const key = WorkspaceAccountScope.key(account)
      const status =
        account.status !== 'available'
          ? account.status
          : failedDaoKeys.has(key)
            ? 'unavailable'
            : truncatedDaoKeys.has(key)
              ? 'partial'
              : 'available'
      return {
        account: { network: account.network, address: account.address },
        resource: 'members',
        source: account.type === 'safe' ? 'safe' : 'index',
        status,
      }
    })

    return {
      data,
      metadata: {
        page,
        pageSize,
        totalRecords: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize),
      },
      coverage,
      partial: coverage.some(item => item.status !== 'available'),
    }
  },
}

export default WorkspaceController
