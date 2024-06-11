import { EnumConnection, type HexAddress, type IService, NetworksEnum } from '@types'
import { TokensList } from './tokens'
import { UtilsIndexer } from '@indexer/utils/indexer'

export const InitialData: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB],

  start: async () => {
    // Tokens init data
    const tokens = TokensList.filter(tk => tk.network === NetworksEnum.mainnet)
    await Promise.all(
      tokens.map(async token => {
        await UtilsIndexer.saveAndGetToken(token.contractAddress as HexAddress, token.network)
      }),
    )
  },

  stop: async () => {},
}

export default InitialData
