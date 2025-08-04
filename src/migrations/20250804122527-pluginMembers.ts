import { type IMigration } from '@types'
import logger from '@logger'
import mongoose from 'mongoose'
import * as pLimit from 'p-limit'
import { ProxyMember } from '@modules/proxyMember'

const llo = logger.logMeta.bind(null, { service: 'Migration: pluginMembers' })

export const pluginMembersMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250804122527-pluginMembers' }))

    try {
      // Get the raw MongoDB collections
      const daoMemberMappingCollection = mongoose.connection.collection('DaoMemberMapping')
      const memberMetricsCollection = mongoose.connection.collection('MemberMetric')

      // Query all daoMemberMapping documents where tokenAddress is null
      const daoMemberMappings = await daoMemberMappingCollection.find({ tokenAddress: null }).toArray()

      logger.info('Found daoMemberMapping documents with null tokenAddress', llo({ count: daoMemberMappings.length }))

      if (daoMemberMappings.length === 0) {
        logger.info('No daoMemberMapping documents to migrate', llo({}))
        return
      }

      let processedCount = 0
      let errorCount = 0
      const limit = pLimit.default(50) // Process 50 documents concurrently

      // Process documents asynchronously with concurrency limit
      const promises = daoMemberMappings.map(async daoMemberMapping =>
        limit(async () => {
          try {
            // Query memberMetrics for this member and plugin
            const memberMetrics = await memberMetricsCollection.findOne({
              address: daoMemberMapping.memberAddress,
              pluginAddress: daoMemberMapping.pluginAddress,
            })

            await ProxyMember.createMember(daoMemberMapping.memberAddress)

            await ProxyMember.addPluginMember({
              memberAddress: daoMemberMapping.memberAddress,
              daoAddress: daoMemberMapping.daoAddress,
              pluginAddress: daoMemberMapping.pluginAddress,
              network: daoMemberMapping.network,
            })

            await ProxyMember.updatePluginMetrics({
              memberAddress: daoMemberMapping.memberAddress!,
              pluginAddress: daoMemberMapping.pluginAddress,
              network: daoMemberMapping.network,
              daoAddress: daoMemberMapping.daoAddress,
              lastActivity: memberMetrics?.lastActivity,
            })

            processedCount++

            if (processedCount % 100 === 0) {
              logger.info(
                'Migration progress',
                llo({
                  processed: processedCount,
                  total: daoMemberMappings.length,
                  errors: errorCount,
                  percentage: ((processedCount / daoMemberMappings.length) * 100).toFixed(2),
                }),
              )
            }
          } catch (error) {
            logger.error(
              'Error processing daoMemberMapping document',
              llo({
                error,
                document: daoMemberMapping,
              }),
            )
            errorCount++
          }
        }),
      )

      // Wait for all promises to complete
      await Promise.all(promises)

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20250804122527-pluginMembers',
          totalProcessed: processedCount,
          errors: errorCount,
          total: daoMemberMappings.length,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250804122527-pluginMembers', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default pluginMembersMigration
