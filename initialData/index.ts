import { EnumConnection, type IService, NetworksEnum } from '@types'
import { TokensList } from './tokens'
import { ProxyToken } from '@modules/proxyToken'

export const InitialData: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    // Tokens init data
    const tokens = TokensList.filter(tk => tk.network === NetworksEnum.arbitrumMainnet)
    await Promise.all(
      tokens.map(async token => {
        await ProxyToken.saveAndGetToken(token.contractAddress, token.network)
      }),
    )
  },

  stop: async () => {},
}

export default InitialData
