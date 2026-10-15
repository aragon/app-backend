import { Models } from '@dbModels'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import type { IWorkspaceAccountRef, IWorkspaceCoverage, IWorkspaceResource } from '@src/types/workspace'

const WorkspaceAccounts = {
  async findDaos(accounts: IWorkspaceAccountRef[]) {
    if (accounts.length === 0) return new Map<string, { name?: string }>()
    const daos = await Models.Dao.find(WorkspaceAccountScope.filter(accounts, 'address'), {
      address: 1,
      network: 1,
      name: 1,
    }).lean()
    return new Map<string, { name?: string }>(
      daos.map((dao: IWorkspaceAccountRef & { name?: string }) => [WorkspaceAccountScope.key(dao), dao]),
    )
  },

  /** Keys of the selected accounts that are admin-registered Safes on that network. */
  async findTrackedSafes(accounts: IWorkspaceAccountRef[]): Promise<Set<string>> {
    if (accounts.length === 0) return new Set<string>()
    const safes = await Models.SafeAccount.find(
      { ...WorkspaceAccountScope.filter(accounts, 'safeAddress'), tracked: true },
      { network: 1, safeAddress: 1 },
    ).lean()
    return new Set(safes.map(safe => WorkspaceAccountScope.key({ network: safe.network, address: safe.safeAddress })))
  },

  async coverage(accounts: IWorkspaceAccountRef[], resource: IWorkspaceResource): Promise<IWorkspaceCoverage[]> {
    const [daos, trackedSafes] = await Promise.all([
      WorkspaceAccounts.findDaos(accounts),
      WorkspaceAccounts.findTrackedSafes(accounts),
    ])
    return accounts.map(account => {
      const key = WorkspaceAccountScope.key(account)
      return {
        account,
        resource,
        source: 'index',
        // A DAO record or a tracked Safe establishes indexing support, not that its index is caught up to chain head.
        // Other addresses can have stored rows, but we cannot assert complete collection coverage.
        status: daos.has(key) || trackedSafes.has(key) ? 'available' : 'unverified',
      }
    })
  },
}

export default WorkspaceAccounts
