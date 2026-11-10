import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum } from '@types'

const DaoOrSafe = {
  async isDaoOrSafe(network: NetworksEnum, address: HexAddress): Promise<boolean> {
    if (await Models.Dao.findByAddress(address, network)) return true
    return !!(await Models.SafeAccount.findTracked(network, address))
  },
}

export default DaoOrSafe
