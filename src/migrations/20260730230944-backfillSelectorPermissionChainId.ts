import { Models } from '@dbModels'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { type IMigration, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: backfillSelectorPermissionChainId' })

const MIGRATION_NAME = '20260730230944-backfillSelectorPermissionChainId'

// Rows indexed before the cross-chain condition have no chainId. Every one of
// them came from a same-chain condition, so the destination chain is the row's
// own network. Setting it everywhere keeps a single format once the handlers
// start writing chainId on every row.
export const backfillSelectorPermissionChainIdMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    try {
      const collection = Models.SelectorPermission.collection

      for (const [network, chainId] of Object.entries(ProviderModule.networkChainMap)) {
        const result = await collection.updateMany(
          { network: network as NetworksEnum, $or: [{ chainId: { $exists: false } }, { chainId: null }] },
          { $set: { chainId } },
        )

        if (result.matchedCount > 0) {
          logger.info(
            'Backfilled selector permission chainId',
            llo({ migration: MIGRATION_NAME, network, chainId, modifiedCount: result.modifiedCount }),
          )
        }
      }

      const remaining = await collection.countDocuments({
        $or: [{ chainId: { $exists: false } }, { chainId: null }],
      })
      if (remaining > 0) {
        // Only possible for rows whose network is not in networkChainMap.
        logger.warn('Rows left without chainId after backfill', llo({ migration: MIGRATION_NAME, remaining }))
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION_NAME }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default backfillSelectorPermissionChainIdMigration
