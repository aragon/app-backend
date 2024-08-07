import { Models } from '@dbModels'
import { TokensList } from '@tools/../initialData/tokens'
import { TokenProxy } from '@modules/tokenProxy'

const ToolSyncManualIndexer = {
  addInitTokens: async () => {
    const tokens = TokensList
    await Promise.all(tokens.map(async token => TokenProxy.saveAndGetToken(token.contractAddress, token.network)))
  },

  syncTokensFromLogPluginSetupProcessor: async () => {
    const logs = await Models.LogPluginSetupProcessor.find({ tokenAddress: { $ne: null } })
    await Promise.all(logs.map(async (log: any) => TokenProxy.saveAndGetToken(log.tokenAddress, log.network)))
  },
}

export default ToolSyncManualIndexer
