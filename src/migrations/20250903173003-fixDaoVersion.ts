import { Models } from '@dbModels'
import ProxyContractHelper from '@helpers/proxyContract'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: fixDaoVersion' })

export const FixDaoVersionMigration: IMigration & { onDocument: any } = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250903173003-fixDaoVersion' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Proposal,
        onDocument: FixDaoVersionMigration.onDocument,
        useAggregate: true,
        onError: (error: any, document: any) => {
          logger.error('Error Sync all', { document, error })
        },
        batchSize: 500,
        concurrency: 10,
        aggregate: (_skip: number | undefined, _limit: number | undefined) => {
          return [
            {
              $match: {
                rawActions: {
                  $elemMatch: {
                    data: { $regex: /^0x4f1ef286/i },
                  },
                },
              },
            },
            {
              $lookup: {
                from: 'Dao',
                let: {
                  daoAddress: '$daoAddress',
                  network: '$network',
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: ['$$daoAddress', '$address'],
                          },
                          {
                            $eq: ['$network', '$$network'],
                          },
                        ],
                      },
                    },
                  },
                ],
                as: 'daoInfo',
              },
            },
            {
              $addFields: {
                daoInfo: {
                  $arrayElemAt: ['$daoInfo', 0],
                },
              },
            },
            {
              $project: {
                daoAddress: '$daoInfo.address',
                version: '$daoInfo.version',
                network: '$daoInfo.network',
                implementationAddress: '$daoInfo.implementationAddress',
              },
            },
            {
              $match: {
                version: '1.3.0',
              },
            },
            {
              $skip: _skip ?? 0,
            },
            {
              $limit: _limit ?? 500,
            },
          ]
        },
      })

      await crawler.crawl()

      logger.info('Migration completed successfully', llo({ migration: '20250903173003-fixDaoVersion' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250903173003-fixDaoVersion', error }))
      throw error
    }
  },

  stop: () => {},

  onDocument: async (doc: any) => {
    const implementationAddress = await ProxyContractHelper.getImplementationAddress(doc.daoAddress, doc.network)
    const version = await Web3Helper.getDaoOsVersion(doc.daoAddress, doc.network)

    if (doc.implementationAddress !== implementationAddress || doc.version !== version) {
      const updated = await Models.Dao.updateOne(
        { address: doc.daoAddress, network: doc.network },
        {
          implementationAddress,
          version,
        },
      )

      if (updated.modifiedCount > 0) {
        logger.info(
          'Updated DAO version and implementation',
          llo({ daoAddress: doc.daoAddress, network: doc.network, implementationAddress, version }),
        )
      } else {
        logger.warn('No DAO document updated', llo({ daoAddress: doc.daoAddress, network: doc.network }))
      }
    }
  },
}

export default FixDaoVersionMigration
