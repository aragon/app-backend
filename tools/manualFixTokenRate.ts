import { EnumConnection, type IService, ITokenType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import BlockScout from '@helpers/blockScout'
import { RateModule } from '@modules/rates'

const llo = logger.logMeta.bind(null, { service: 'tools:ToolsManualSyncToken' })
export const ToolsManualSyncToken: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const tokens = await Models.Token.find({
      network: { $in: [NetworksEnum.polygonMainnet, NetworksEnum.ethereumMainnet] },
      type: { $ne: 'GovernanceERC20' },
      $or: [{ name: { $not: { $regex: /https?:\/\/\S+/i } } }, { symbol: { $not: { $regex: /https?:\/\/\S+/i } } }],
    })

    logger.info('Tokens to sync', llo({ tokens: tokens.length }))
    let counter = 0

    for (const token of tokens) {
      counter++

      const tokenInfo = await BlockScout.getTokenFullDetails(token.address, token.network)
      const tokenRate = await RateModule.fetchRate(token.address, token.network)

      if (tokenInfo && tokenRate.decimals !== null) {
        const skipFetchRate = tokenRate.priceUsd === '0'
        await token.update({
          priceUSD: tokenRate.priceUsd,
          priceChangeOnDayUsd: tokenRate.priceChangeOnDayUsd,
          type: token.type === ITokenType.unknown ? tokenInfo.type : token.type,
          skipFetchRate,
          lastUpdatedAt: tokenRate.lastUpdatedAt,
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          logo: tokenInfo.logo,
          holders: tokenInfo.holders,
          totalSupply: tokenInfo.totalSupply,
        })

        logger.info(
          'Token synced',
          llo({ token: token.symbol, remaining: tokens.length - counter, address: token.address }),
        )
      }
    }
  },

  stop: async () => {},
}

export default ToolsManualSyncToken
