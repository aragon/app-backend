import { Models } from '@dbModels'
import { DaoIdParser, type IParsedDaoRef } from '@services/aragon-telegram/helpers/daoId'
import { type HexAddress, type NetworksEnum } from '@types'

export interface IResolvedDao {
  ref: IParsedDaoRef
  name: string
}

export interface IDaoSearchResult extends IResolvedDao {
  network: NetworksEnum
}

/** Search result cap — one full-width button per result, no pagination. */
export const DAO_SEARCH_LIMIT = 5

const displayName = (dao: { name?: string | null }, ref: IParsedDaoRef): string => dao.name || `${ref.network} DAO`

/**
 * Resolve an explicit organization reference — an Aragon URL (address or ENS
 * form), a `network-address` id, or a bare `name.dao.eth` ENS name — to the
 * organization it points at.
 *
 * Returns the resolved ref, `'not-found'` when the shape parsed but no such
 * organization exists, or `null` when the input isn't an explicit reference
 * at all (callers fall through to name search or usage help).
 */
export const resolveExplicitDaoRef = async (raw: string): Promise<IResolvedDao | 'not-found' | null> => {
  const addressRef = DaoIdParser.parse(raw)
  if (addressRef) {
    const dao = await Models.Dao.findByAddress(addressRef.daoAddress, addressRef.network)
    if (!dao) return 'not-found'
    return { ref: addressRef, name: displayName(dao, addressRef) }
  }

  const ensRef = DaoIdParser.parseEns(raw)
  if (ensRef) {
    const dao = await Models.Dao.findOne({ ens: ensRef.ens, network: ensRef.network })
    if (!dao) return 'not-found'
    const ref: IParsedDaoRef = { network: dao.network, daoAddress: dao.address as HexAddress }
    return { ref, name: displayName(dao, ref) }
  }

  return null
}

/**
 * Case-insensitive name search over visible organizations — the same shape the
 * app's Explore page uses. Returns up to `DAO_SEARCH_LIMIT + 1` matches so the
 * caller can tell when results were cut off.
 */
export const searchDaosByName = async (query: string): Promise<IDaoSearchResult[]> => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const daos = await Models.Dao.find(
    {
      name: { $regex: escaped, $options: 'i' },
      isActive: true,
      isHidden: { $ne: true },
    },
    { _id: 0, name: 1, network: 1, address: 1 },
  )
    .sort({ tvlUSD: -1 })
    .limit(DAO_SEARCH_LIMIT + 1)

  return daos.map(dao => {
    const ref: IParsedDaoRef = { network: dao.network, daoAddress: dao.address as HexAddress }
    return { ref, name: displayName(dao, ref), network: dao.network }
  })
}
