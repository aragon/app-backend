import { Models } from '@dbModels'
import type Dao from '@models/schema/dao'
import ModelUtils from '@models/utils/models'
import type { IWorkspaceAccountSuggestion, IWorkspaceRankedSuggestion } from '@src/types/workspace'
import type { HexAddress, IDaoResponse, IPaginatedResult, IPaginationParams } from '@types'

const WorkspaceSuggestions = {
  rank(
    candidates: Pick<Dao, 'id' | 'network' | 'address' | 'creatorAddress'>[],
    wallet: HexAddress,
  ): IWorkspaceRankedSuggestion[] {
    const creators: IWorkspaceRankedSuggestion[] = []
    const members: IWorkspaceRankedSuggestion[] = []
    for (const { id, network, address, creatorAddress } of candidates) {
      if (creatorAddress === wallet) creators.push({ id, network, address, role: 'creator' })
      else members.push({ id, network, address, role: 'member' })
    }
    return [
      ...creators.sort(WorkspaceSuggestions._byNetworkThenAddress),
      ...members.sort(WorkspaceSuggestions._byNetworkThenAddress),
    ]
  },

  _byNetworkThenAddress(a: IWorkspaceRankedSuggestion, b: IWorkspaceRankedSuggestion) {
    return a.network.localeCompare(b.network) || a.address.localeCompare(b.address)
  },

  // A page past the end keeps the real totals, only an empty list gets the shared empty shape.
  async page(
    ranked: IWorkspaceRankedSuggestion[],
    { page = 1, pageSize = 10 }: IPaginationParams,
  ): Promise<IPaginatedResult<IWorkspaceAccountSuggestion>> {
    const totalRecords = ranked.length
    if (!totalRecords) return ModelUtils.paginateEmptyResponse(pageSize)

    const selected = ranked.slice((page - 1) * pageSize, page * pageSize)
    const { data: daos } = await Models.Dao.findWithPagination({
      extraQueryData: { daoPairs: selected.map(({ address, network }) => ({ daoAddress: address, network })) },
      paginationParams: { pageSize: selected.length },
    })
    const byId = new Map<string, IDaoResponse>(daos.map(dao => [dao.id, dao]))
    const data = selected.map(({ id, network, address, role }) => {
      const dao = byId.get(id)
      if (!dao) throw new Error(`Missing DAO suggestion ${id}`)
      return { account: { type: 'dao' as const, network, address }, role, dao }
    })
    return { data, metadata: { page, pageSize, totalRecords, totalPages: Math.ceil(totalRecords / pageSize) } }
  },
}

export default WorkspaceSuggestions
