import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@src/governance'
import type {
  IWorkspaceAccount,
  IWorkspaceAccountRef,
  IWorkspaceMember,
  IWorkspaceMembership,
} from '@src/types/workspace'
import { type IMembersResponse, type IPaginationParams, IPluginStatus } from '@types'
import { mapLimit } from 'async'

const SOURCE_PAGE_SIZE = 50
// Members are merged and paged in memory, so one governance source is read up to this many rows.
// A larger source is reported as partial coverage rather than read to the end on every request.
const SOURCE_MAX_PAGES = 20

type MemberEntry = {
  member: IMembersResponse
  membership: IWorkspaceMembership
}

type PluginRead = { entries: MemberEntry[]; failed: boolean; truncated: boolean }

async function readPlugin(plugin: any): Promise<PluginRead> {
  try {
    const governance = MemberGovernanceFactory.createFromPlugin(plugin)
    const pagination: IPaginationParams = { page: 1, pageSize: SOURCE_PAGE_SIZE, sort: 'address', order: 'asc' }
    const first = await governance.findAndPaginateMembers({
      paginationParams: pagination,
      extraParams: {
        network: plugin.network,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        tokenAddress: plugin.tokenAddress,
      },
    })
    const pages = [first]
    const lastPage = Math.min(first.metadata.totalPages, SOURCE_MAX_PAGES)
    for (let page = 2; page <= lastPage; page += 1) {
      pages.push(
        await governance.findAndPaginateMembers({
          paginationParams: { ...pagination, page },
          extraParams: {
            network: plugin.network,
            daoAddress: plugin.daoAddress,
            pluginAddress: plugin.address,
            tokenAddress: plugin.tokenAddress,
          },
        }),
      )
    }

    return {
      failed: false,
      truncated: first.metadata.totalPages > SOURCE_MAX_PAGES,
      entries: pages.flatMap(result =>
        result.data
          .filter(member => !!member.address)
          .map(member => ({
            member,
            membership: {
              account: { network: plugin.network, address: plugin.daoAddress },
              governance: { address: plugin.address, type: plugin.interfaceType },
              role: 'member' as const,
              ...(member.votingPower !== undefined && { votingPower: member.votingPower }),
              ...(member.tokenBalance !== undefined && { tokenBalance: member.tokenBalance }),
            },
          })),
      ),
    }
  } catch (_error) {
    return { entries: [], failed: true, truncated: false }
  }
}

function addMember(store: Map<string, IWorkspaceMember>, member: IWorkspaceMember, membership: IWorkspaceMembership) {
  const key = `${member.network}:${member.address.toLowerCase()}`
  const existing = store.get(key)
  if (!existing) {
    store.set(key, { ...member, memberships: [membership] })
    return
  }

  const membershipKey = `${membership.account.network}:${membership.account.address.toLowerCase()}:${membership.governance.address.toLowerCase()}:${membership.role}`
  const duplicate = existing.memberships.some(
    item =>
      `${item.account.network}:${item.account.address.toLowerCase()}:${item.governance.address.toLowerCase()}:${item.role}` ===
      membershipKey,
  )
  if (!duplicate) existing.memberships.push(membership)
}

const WorkspaceMembers = {
  async read(accounts: IWorkspaceAccountRef[], resolvedAccounts: IWorkspaceAccount[]) {
    const plugins =
      accounts.length === 0
        ? []
        : await Models.Plugin.find(
            {
              $and: [
                { $or: accounts.map(account => ({ network: account.network, daoAddress: account.address })) },
                { status: IPluginStatus.installed },
              ],
            },
            {
              network: 1,
              address: 1,
              daoAddress: 1,
              interfaceType: 1,
              tokenAddress: 1,
              lockManagerAddress: 1,
              votingEscrow: 1,
            },
          ).lean()

    const pluginResults = await mapLimit<any, PluginRead>(plugins, 4, readPlugin)
    const members = new Map<string, IWorkspaceMember>()
    for (const result of pluginResults) {
      for (const { member, membership } of result.entries) {
        addMember(
          members,
          {
            network: membership.account.network,
            address: member.address,
            ens: member.ens ?? null,
            avatar: (member as any).avatar ?? null,
            memberships: [],
          },
          membership,
        )
      }
    }

    for (const account of resolvedAccounts) {
      if (account.type !== 'safe' || !account.safe) continue
      for (const owner of account.safe.owners) {
        addMember(
          members,
          { network: account.network, address: owner, memberships: [] },
          {
            account: { network: account.network, address: account.address },
            governance: { address: account.address, type: 'safe' },
            role: 'owner',
          },
        )
      }
    }

    const failedDaoKeys = new Set<string>()
    const truncatedDaoKeys = new Set<string>()
    pluginResults.forEach((result, index) => {
      const plugin = plugins[index]
      const key = `${plugin.network}:${plugin.daoAddress.toLowerCase()}`
      if (result.failed) failedDaoKeys.add(key)
      if (result.truncated) truncatedDaoKeys.add(key)
    })

    return { data: [...members.values()], failedDaoKeys, truncatedDaoKeys }
  },
}

export default WorkspaceMembers
