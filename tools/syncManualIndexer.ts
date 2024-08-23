import { Models } from '@dbModels'
import { TokensList } from '@tools/../initialData/tokens'
import { ProxyToken } from '@modules/proxyToken'

const ToolSyncManualIndexer = {
  addInitTokens: async () => {
    const tokens = TokensList
    await Promise.all(tokens.map(async token => ProxyToken.saveAndGetToken(token.contractAddress, token.network)))
  },

  syncTokensFromLogPluginSetupProcessor: async () => {
    const logs = await Models.LogPluginSetupProcessor.find({ tokenAddress: { $ne: null } })
    await Promise.all(logs.map(async (log: any) => ProxyToken.saveAndGetToken(log.tokenAddress, log.network)))
  },
}

export default ToolSyncManualIndexer
