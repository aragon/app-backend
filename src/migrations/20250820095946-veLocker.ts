import { type IMigration, IPluginInterfaceType, ITokenType } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import mongoose from 'mongoose'
import * as pLimit from 'p-limit'
import { MemberGovernanceFactory } from '@src/governance'
import type Plugin from '@models/schema/plugin'
const llo = logger.logMeta.bind(null, { service: 'Migration: lockToVoteMember' })

export const VeLockerMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250820095946-veLocker.ts' }))

    try {
      const limit = pLimit.default(50)
      const memberBalanceCollection = mongoose.connection.collection('MemberBalance')

      const veTokens = await Models.Lock.aggregate([
        {
          $group: {
            _id: '$tokenAddress',
            users: {
              $push: {
                memberAddress: '$memberAddress',
                tokenId: '$tokenId',
                escrowAddress: '$escrowAddress',
                network: '$network',
              },
            },
          },
        },
        {
          $project: {
            tokenAddress: '$_id',
            users: '$users',
          },
        },
      ])

      if (veTokens.length === 0) {
        logger.info('No Lock found', llo({}))
        return
      }

      const promises = veTokens.map(async (veToken: any) =>
        limit(async () => {
          try {
            for (const lockData of veToken.users) {
              const { tokenId } = lockData
              const memberBalanceEntry = await memberBalanceCollection.findOne({
                tokenAddress: veToken.tokenAddress,
                tokenIds: {
                  $in: [tokenId],
                },
              })

              if (memberBalanceEntry && memberBalanceEntry.tokenIds.includes(tokenId)) {
                const governance = MemberGovernanceFactory.create({
                  address: lockData.escrowAddress,
                  network: lockData.network,
                  interfaceType: IPluginInterfaceType.tokenVoting,
                  tokenType: ITokenType.escrowAdapter,
                  extraParams: {
                    escrowAdapterAddress: veToken.tokenAddress,
                  },
                })

                await governance.update(lockData.memberAddress, {
                  tokenIds: [tokenId],
                  delegateReceiverAddress: memberBalanceEntry.address,
                  lastActivity: memberBalanceEntry.lastSyncAmountBlockNumber,
                })

                const plugins = await Models.Plugin.find({
                  network: memberBalanceEntry.network,
                  tokenAddress: memberBalanceEntry.tokenAddress,
                })

                await Promise.all(
                  plugins.map(async (plugin: Plugin) => {
                    const governance = MemberGovernanceFactory.create({
                      address: plugin.tokenAddress,
                      network: plugin.network,
                      interfaceType: IPluginInterfaceType.tokenVoting,
                      tokenType: ITokenType.escrowAdapter,
                    })

                    await governance.updatePluginMetrics({
                      memberAddress: lockData.memberAddress,
                      pluginAddress: plugin.address,
                      daoAddress: plugin.daoAddress,
                      network: plugin.network,
                      lastActivity: memberBalanceEntry.lastSyncAmountBlockNumber,
                    })
                  }),
                )
              }
            }
          } catch (e) {
            logger.error(
              'updating lockToVoteMember',
              llo({
                migration: '20250811180419-lockToVoteMember',
                tokenAddress: veToken.tokenAddress,
              }),
            )
          }
        }),
      )

      await Promise.all(promises)

      logger.info('Migration completed successfully', llo({ migration: '20250820095946-veLocker' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250820095946-veLocker', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default VeLockerMigration
