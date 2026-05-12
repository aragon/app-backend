import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { type IMigration, ITokenType, NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: fix-citrea-token-decimals' })
const MIGRATION = '20260512090000-fix-citrea-token-decimals'

export const fixCitreaTokenDecimalsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    const tokens = await Models.Token.find({
      network: NetworksEnum.citreaMainnet,
      type: { $ne: ITokenType.native },
      hasDecimals: true,
    })

    let updated = 0
    let skipped = 0
    let failed = 0

    for (const token of tokens) {
      try {
        const onChainDecimals = await Web3Helper.getTokenDecimals(token.address, token.network)

        if (!onChainDecimals) {
          logger.warn('Skipping token: on-chain decimals returned 0', llo({ address: token.address }))
          skipped++
          continue
        }

        if (onChainDecimals === token.decimals) {
          skipped++
          continue
        }

        await token.update({ decimals: onChainDecimals })
        logger.info(
          'Updated token decimals',
          llo({ address: token.address, symbol: token.symbol, from: token.decimals, to: onChainDecimals }),
        )
        updated++
      } catch (error) {
        logger.error('Failed to update token decimals', llo({ address: token.address, error }))
        failed++
      }
    }

    logger.info('Migration completed', llo({ migration: MIGRATION, scanned: tokens.length, updated, skipped, failed }))
  },

  stop: async () => {},
}

export default fixCitreaTokenDecimalsMigration
