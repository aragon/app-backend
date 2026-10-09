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

  async coverage(accounts: IWorkspaceAccountRef[], resource: IWorkspaceResource): Promise<IWorkspaceCoverage[]> {
    const daos = await WorkspaceAccounts.findDaos(accounts)
    return accounts.map(account => ({
      account,
      resource,
      source: 'index',
      // A DAO record establishes indexing support, not that its index is caught up to chain head.
      // Other addresses can have stored rows, but we cannot assert complete collection coverage.
      status: daos.has(WorkspaceAccountScope.key(account)) ? 'available' : 'unverified',
    }))
  },
}

export default WorkspaceAccounts
