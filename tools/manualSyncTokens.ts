import { EnumConnection, type IService } from '@types'
import { Models } from '@dbModels'
import TokenDetector from '@helpers/tokenDetector'
import type Token from '@models/schema/token'

export const ToolsManualSyncTokens: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const tokens = await Models.Token.find({ hasDelegate: { $exists: false } })

    await Promise.all(
      tokens.map(async (token: Token) => {
        const tokenTypeInfo = await TokenDetector.detectTokenType(token.address, token.network)
        await token.update({
          hasDelegate: tokenTypeInfo.hasDelegate,
        })
      }),
    )
  },

  stop: async () => {},
}

export default ToolsManualSyncTokens
