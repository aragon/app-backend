import { Models } from '@dbModels'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import { ProxyToken } from '@modules/proxyToken'
import { type IMigration, IPluginInterfaceType } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillGaugePluginTokens' })

export const backfillGaugePluginTokensMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260804180138-backfillGaugePluginTokens' }))

    try {
      const plugins = await Models.Plugin.find({
        interfaceType: IPluginInterfaceType.gauge,
        tokenAddress: { $ne: null },
      })

      const seen = new Set<string>()
      let created = 0
      let failed = 0

      for (const plugin of plugins as Plugin[]) {
        const key = `${plugin.network}-${plugin.tokenAddress}`
        if (seen.has(key)) continue
        seen.add(key)

        const existingToken = await Models.Token.findExistingLog({
          address: plugin.tokenAddress,
          network: plugin.network,
        })
        if (existingToken) continue

        const token = await ProxyToken.saveAndGetToken(plugin.tokenAddress, plugin.network)
        if (token) {
          created++
          logger.verbose(
            'Backfilled missing gauge plugin token',
            llo({ pluginAddress: plugin.address, tokenAddress: plugin.tokenAddress, network: plugin.network }),
          )
        } else {
          failed++
          logger.warn(
            'Could not backfill gauge plugin token',
            llo({ pluginAddress: plugin.address, tokenAddress: plugin.tokenAddress, network: plugin.network }),
          )
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: '20260804180138-backfillGaugePluginTokens', created, failed }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260804180138-backfillGaugePluginTokens', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default backfillGaugePluginTokensMigration
