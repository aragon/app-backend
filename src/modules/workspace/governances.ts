import { Models } from '@dbModels'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import type { IWorkspaceAccount, IWorkspaceAccountGovernances, IWorkspaceAccountRef } from '@src/types/workspace'
import { type HexAddress, IPluginStatus, type NetworksEnum } from '@types'

export type WorkspacePlugin = {
  network: NetworksEnum
  address: HexAddress
  daoAddress: HexAddress
  interfaceType: string
  isBody?: boolean
  name?: string | null
  description?: string | null
  processKey?: string | null
  tokenAddress?: HexAddress | null
  lockManagerAddress?: HexAddress | null
  votingEscrow?: HexAddress | null
}

const WorkspaceGovernances = {
  /** Installed body plugins of the selected DAOs, with the fields the governance factory reads. */
  async findBodyPlugins(accounts: IWorkspaceAccountRef[]): Promise<WorkspacePlugin[]> {
    if (accounts.length === 0) return []
    return Models.Plugin.find(
      { ...WorkspaceAccountScope.filter(accounts), status: IPluginStatus.installed, isBody: true },
      {
        network: 1,
        address: 1,
        daoAddress: 1,
        interfaceType: 1,
        name: 1,
        description: 1,
        processKey: 1,
        tokenAddress: 1,
        lockManagerAddress: 1,
        votingEscrow: 1,
      },
    ).lean() as Promise<WorkspacePlugin[]>
  },

  /**
   * The body plugins of each selected account, in selection order. A Safe selected as an account has
   * no bodies: it is one itself, and its owners come back from the members query with the Safe as
   * their governance. Safes sitting in an SPP stage belong to the process and are not listed.
   */
  async resolve(
    accounts: IWorkspaceAccountRef[],
    resolvedAccounts: IWorkspaceAccount[],
  ): Promise<IWorkspaceAccountGovernances[]> {
    const plugins = await WorkspaceGovernances.findBodyPlugins(accounts)
    const slugs = new Map<string, string>(
      plugins.length === 0
        ? []
        : (
            await Models.PluginSlug.find(
              {
                $or: plugins.map(plugin => ({
                  network: plugin.network,
                  daoAddress: plugin.daoAddress,
                  pluginAddress: plugin.address,
                })),
              },
              { network: 1, pluginAddress: 1, slug: 1 },
            ).lean()
          ).map(row => [WorkspaceAccountScope.key({ network: row.network, address: row.pluginAddress }), row.slug]),
    )

    const groups = new Map<string, IWorkspaceAccountGovernances>()
    for (const account of resolvedAccounts) {
      groups.set(WorkspaceAccountScope.key(account), {
        account: { network: account.network, address: account.address, type: account.type },
        governances: [],
      })
    }
    for (const plugin of plugins) {
      groups.get(WorkspaceAccountScope.key({ network: plugin.network, address: plugin.daoAddress }))?.governances.push({
        address: plugin.address,
        type: plugin.interfaceType,
        slug: slugs.get(WorkspaceAccountScope.key(plugin)) ?? null,
        name: plugin.name ?? null,
        description: plugin.description ?? null,
        processKey: plugin.processKey ?? null,
      })
    }
    return [...groups.values()]
  },
}

export default WorkspaceGovernances
