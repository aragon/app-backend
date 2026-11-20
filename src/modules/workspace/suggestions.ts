import { Models } from '@dbModels'
import type Dao from '@models/schema/dao'
import ModelUtils from '@models/utils/models'
import type { IWorkspaceAccountSuggestion, IWorkspaceRankedSuggestion } from '@src/types/workspace'
import type { HexAddress, IDaoResponse, IPaginatedResult, IPaginationParams } from '@types'

const WorkspaceSuggestions = {
  listCreatorsFirst(
    daos: Pick<Dao, 'id' | 'network' | 'address' | 'creatorAddress'>[],
    wallet: HexAddress,
  ): IWorkspaceRankedSuggestion[] {
    const creators: IWorkspaceRankedSuggestion[] = []
    const members: IWorkspaceRankedSuggestion[] = []
    for (const { id, network, address, creatorAddress } of daos) {
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
  async getPage(
    ranked: IWorkspaceRankedSuggestion[],
    { page = 1, pageSize = 10 }: IPaginationParams,
  ): Promise<IPaginatedResult<IWorkspaceAccountSuggestion>> {
    const totalRecords = ranked.length
    if (!totalRecords) return ModelUtils.paginateEmptyResponse(pageSize)

    const selected = ranked.slice((page - 1) * pageSize, page * pageSize)
    const daos = await WorkspaceSuggestions._findPageDaos(selected)
    const data = selected.map(item => WorkspaceSuggestions._formatSuggestion(item, daos))
    return ModelUtils.paginateResponse(data, page, pageSize, totalRecords)
  },

  async _findPageDaos(selected: IWorkspaceRankedSuggestion[]): Promise<Map<string, IDaoResponse>> {
    const daoPairs = selected.map(({ network, address }) => ({ daoAddress: address, network }))
    if (!daoPairs.length) return new Map()

    const { data } = await Models.Dao.findWithPagination({
      extraQueryData: { daoPairs },
      paginationParams: { pageSize: daoPairs.length },
    })
    return new Map<string, IDaoResponse>(data.map((dao: IDaoResponse) => [dao.id, dao]))
  },

  _formatSuggestion(item: IWorkspaceRankedSuggestion, daos: Map<string, IDaoResponse>): IWorkspaceAccountSuggestion {
    const { id, network, address, role } = item
    const dao = daos.get(id)
    if (!dao) throw new Error(`Missing DAO suggestion ${id}`)
    return { account: { type: 'dao', network, address }, role, dao }
  },
}

export default WorkspaceSuggestions
