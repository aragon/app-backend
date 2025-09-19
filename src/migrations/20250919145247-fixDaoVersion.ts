import { type ILogInfo, type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import ProviderModule from '@modules/provider'

const llo = logger.logMeta.bind(null, { service: 'Migration: fixDaoVersion' })

export const fixDaoVersionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250919145247-fixDaoVersion' }))
    await ProviderModule.connectToAllNetworks()
    try {
      const allDaos = await Models.Proposal.aggregate([
        {
          $match: { rawActions: { $elemMatch: { data: { $regex: '^0x4f1ef286' } } } },
        },
        {
          $match: {
            'executed.status': true,
          },
        },
        {
          $lookup: {
            from: 'Dao',
            let: {
              address: '$daoAddress',
              network: '$network',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $eq: ['$$address', '$address'],
                      },
                    ],
                  },
                },
              },
            ],
            as: 'daoDetails',
          },
        },
        {
          $addFields: {
            daoVersion: {
              $arrayElemAt: ['$daoDetails.version', 0],
            },
          },
        },
        {
          $project: {
            daoAddress: '$daoAddress',
            version: '$daoVersion',
            executed: '$executed',
            network: '$network',
          },
        },
        {
          $match: {
            version: '1.3.0',
          },
        },
      ])

      for (const dao of allDaos) {
        const { daoAddress, network, executed } = dao
        const txInfo: Partial<ILogInfo> = {
          transactionHash: executed.transactionHash,
          network,
          address: daoAddress,
        }

        await DaoRegistryHandler.handleVersionUpgrade(daoAddress, txInfo)
        logger.info('Processed DAO for version upgrade', llo({ daoAddress, network }))
      }
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250919145247-fixDaoVersion', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default fixDaoVersionMigration
