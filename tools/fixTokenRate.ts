import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import logger from '@logger'
import { EnumConnection, type IService, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'tools:SyncToken' })

export const SyncToken: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    const regex =
      ' /^(?=.*(?:https?:\\/\\/\\S+|www\\.[a-z0-9-]+\\.[a-z]{2,63}|[a-z0-9-]+\\.[a-z]{2,63}))(?=.*(?:claim|rewards?|join|stake|voucher|airdrop|bonus|free|giveaway|visit)).+$/i'
    const tokens = await Models.Token.find({
      network: { $in: [NetworksEnum.polygonMainnet, NetworksEnum.ethereumMainnet] },
      type: { $ne: 'GovernanceERC20' },
      $nor: [
        {
          name: {
            $regex: regex,
          },
        },
        {
          symbol: {
            $regex: regex,
          },
        },
      ],
    })

    logger.info('Tokens to sync', llo({ tokens: tokens.length }))
    let counter = 0

    for (const token of tokens) {
      counter++

      const tokenRate = await CoinGeckoHelper.getToken(token.address, token.network)

      if (tokenRate && tokenRate.decimals !== null) {
        const skipFetchRate = tokenRate.priceUsd === '0'
        await token.update({
          priceUsd: tokenRate.priceUsd,
          type: token.type === ITokenType.unknown ? tokenRate.type : token.type,
          skipFetchRate,
          lastUpdatedAt: tokenRate.lastUpdatedAt,
          name: tokenRate.name,
          symbol: tokenRate.symbol,
          decimals: tokenRate.decimals,
          logo: tokenRate.logo,
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

export default SyncToken
