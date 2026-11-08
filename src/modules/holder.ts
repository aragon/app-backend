import { Models } from '@dbModels'
import { type HexAddress, type NetworksEnum } from '@types'

const Holder = {
  async isHolder(network: NetworksEnum, address: HexAddress, safes: 'tracked' | 'any'): Promise<boolean> {
    if (await Models.Dao.findByAddress(address, network)) return true
    if (safes === 'tracked') return !!(await Models.SafeAccount.findTracked(network, address))
    return !!(await Models.SafeAccount.findOne({ id: Models.SafeAccount.buildId(network, address) }).lean())
  },
}

export default Holder
