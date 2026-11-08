import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum } from '@types'

const DaoOrSafe = {
  async isDaoOrSafe(
    network: NetworksEnum,
    address: HexAddress,
    { trackedOnly = false }: { trackedOnly?: boolean } = {},
  ): Promise<boolean> {
    if (await Models.Dao.findByAddress(address, network)) return true
    if (trackedOnly) return !!(await Models.SafeAccount.findTracked(network, address))
    return !!(await Models.SafeAccount.findOne({ id: Models.SafeAccount.buildId(network, address) }).lean())
  },
}

export default DaoOrSafe
