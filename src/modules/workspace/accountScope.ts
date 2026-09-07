import type { IWorkspaceAccountRef } from '@src/types/workspace'
import { getAddress } from 'ethers'

const WorkspaceAccountScope = {
  key: ({ network, address }: IWorkspaceAccountRef): string => `${network}:${address.toLowerCase()}`,

  normalize(accounts: IWorkspaceAccountRef[]): IWorkspaceAccountRef[] {
    const unique = new Map<string, IWorkspaceAccountRef>()
    for (const account of accounts) {
      unique.set(WorkspaceAccountScope.key(account), { network: account.network, address: getAddress(account.address) })
    }
    return [...unique.values()]
  },

  // Keep this under $and so a resource's search $or cannot replace the account restriction.
  // Undefined preserves existing single-account queries; an explicit empty scope matches nothing.
  filter(accounts?: IWorkspaceAccountRef[], addressField = 'daoAddress'): Record<string, any> {
    if (accounts === undefined) return {}
    if (accounts.length === 0) return { $and: [{ _id: { $in: [] } }] }
    return {
      $and: [{ $or: accounts.map(({ network, address }) => ({ network, [addressField]: address })) }],
    }
  },
}

export default WorkspaceAccountScope
