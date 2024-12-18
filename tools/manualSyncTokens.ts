import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import { TokensList } from '@src/../config/tokens'
import { ProxyToken } from '@modules/proxyToken'

export const ToolsManualSyncTokens: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    // sync initial tokens
    const tokens = TokensList
    await Promise.all(tokens.map(async token => ProxyToken.saveAndGetToken(token.contractAddress, token.network)))

    // sync tokens from log plugin setup processor
    const logs = await Models.LogPluginSetupProcessor.find({ tokenAddress: { $ne: null } })
    await Promise.all(logs.map(async (log: any) => ProxyToken.saveAndGetToken(log.tokenAddress, log.network)))
  },

  stop: async () => {},
}

export default ToolsManualSyncTokens
