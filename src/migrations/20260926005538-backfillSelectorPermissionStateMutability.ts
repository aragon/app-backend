import { Models } from '@dbModels'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { ContractInfo } from '@services/aragon-gateway/contractInfo'
import { type IMigration } from '@types'

const MIGRATION_NAME = '20260926005538-backfillSelectorPermissionStateMutability'
const llo = logger.logMeta.bind(null, { service: 'Migration: backfillSelectorPermissionStateMutability' })

export const backfillSelectorPermissionStateMutabilityMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    try {
      let updated = 0
      const unresolvedIds: string[] = []

      const cursor = Models.SelectorPermission.find(
        { selector: { $ne: null }, 'decoded.functionName': { $ne: null }, 'decoded.stateMutability': null },
        { id: 1, chainId: 1, selector: 1, target: 1 },
      )
        .lean()
        .cursor()

      for await (const row of cursor) {
        try {
          // The selector lives on the destination chain, same as the handler decodes it.
          const network = ProviderModule.getNetworkByChainId(row.chainId)
          const selectorInfo = network ? await ContractInfo.parseSignature(row.selector, row.target, network) : null

          if (!selectorInfo?.stateMutability) {
            unresolvedIds.push(row.id)
            continue
          }

          await Models.SelectorPermission.collection.updateOne(
            { _id: row._id },
            { $set: { 'decoded.stateMutability': selectorInfo.stateMutability } },
          )
          updated++
        } catch (error) {
          unresolvedIds.push(row.id)
          logger.warn('Could not decode selector', llo({ migration: MIGRATION_NAME, id: row.id, error }))
        }
      }

      logger.info(
        'Migration completed successfully',
        llo({ migration: MIGRATION_NAME, updated, unresolved: unresolvedIds.length, unresolvedIds }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default backfillSelectorPermissionStateMutabilityMigration
