import { Models } from '@dbModels'
import { UtilsIndexer } from '@indexer/utils/indexer'
import { TokensList } from '@tools/../initialData/tokens'

const ToolSyncManualIndexer = {
  addInitTokens: async () => {
    const tokens = TokensList
    await Promise.all(tokens.map(async token => UtilsIndexer.saveAndGetToken(token.contractAddress, token.network)))
  },

  syncTokensFromLogPluginSetupProcessor: async () => {
    const logs = await Models.LogPluginSetupProcessor.find({ tokenAddress: { $ne: null } })
    await Promise.all(logs.map(async (log: any) => UtilsIndexer.saveAndGetToken(log.tokenAddress, log.network)))
  },
}

export default ToolSyncManualIndexer
