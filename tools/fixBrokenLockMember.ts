import { EnumConnection, EnumQueueName, type IService, ITokenType, NetworksEnum } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import Utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ConfigIndexerHelper from '@helpers/configIndexer'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'tools:fixBrokenLockMember' })

export const FixBrokenLockMember: IService & { onDocument: any; cleanupRelatedData: any } = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ],

  start: async () => {
    logger.info('Starting FixBrokenLockMember tool', llo())

    const pluginCrawler = new DBCrawler({
      model: Models.Plugin,
      where: {
        network: NetworksEnum.ethereumSepolia,
        votingEscrow: { $ne: null },
        'votingPower.escrowAddress': '0x4b139dE004AaD88C37716b5D081FDbf2F2A4c4c1',
      },
      limit: 100,
      concurrency: 5,
      onError: (error: any, document: any) => {
        logger.error(
          'Error fixing broken lock member',
          llo({
            error,
            pluginId: document?.id,
            pluginAddress: document?.address,
          }),
        )
      },
      onDocument: FixBrokenLockMember.onDocument,
    })

    await pluginCrawler.crawl()
    logger.info('FixBrokenLockMember completed', llo())

    // syncing the unique plugin only
    const tokens = await Models.Plugin.aggregate([
      {
        tokenAddress: '0x4b139dE004AaD88C37716b5D081FDbf2F2A4c4c1',
        $match: { votingEscrow: { $ne: null } },
      },
      {
        $group: {
          _id: '$tokenAddress',
          plugins: {
            $push: '$$ROOT',
          },
        },
      },
      {
        $addFields: {
          pluginAddress: {
            $first: '$plugins.address',
          },
          network: {
            $first: '$plugins.network',
          },
        },
      },
    ])

    for (const token of tokens) {
      await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
        id: token.pluginAddress,
        params: { address: token.pluginAddress, network: token.network, isHistorical: true },
      })
    }
  },

  onDocument: async (plugin: Plugin) => {
    logger.info(
      'Processing plugin with voting escrow',
      llo({
        pluginId: plugin.id,
        pluginAddress: plugin.address,
        escrowAddress: plugin.votingEscrow?.escrowAddress,
      }),
    )

    try {
      // Step 1: Clear existing data from related tables
      await FixBrokenLockMember.cleanupRelatedData(plugin)

      // Step 2: Trigger re-sync via RabbitMQ
      await RabbitMQHelper.sendMessage(EnumQueueName.plugins, {
        id: `fix-broken-lock-${plugin.id}`,
        params: {
          address: plugin.address,
          network: plugin.network,
          isHistorical: true,
        },
      })

      logger.info(
        'Successfully triggered re-sync for plugin',
        llo({
          pluginId: plugin.id,
          pluginAddress: plugin.address,
        }),
      )

      // Add delay to prevent overwhelming the system
      await Utils.wait(1000)
    } catch (error) {
      logger.error(
        'Failed to process plugin',
        llo({
          error,
          pluginId: plugin.id,
          pluginAddress: plugin.address,
        }),
      )
      throw error
    }
  },

  cleanupRelatedData: async (plugin: Plugin) => {
    logger.info(
      'Cleaning up related data for plugin',
      llo({
        pluginId: plugin.id,
        pluginAddress: plugin.address,
      }),
    )

    const deleteOperations: any = []

    deleteOperations.push(
      Models.MemberBalance.deleteMany({
        network: plugin.network,
        tokenAddress: plugin.tokenAddress,
      }),
    )

    deleteOperations.push(
      Models.DaoMemberMapping.deleteMany({
        network: plugin.network,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
      }),
    )

    deleteOperations.push(
      Models.MemberTransaction.deleteMany({
        network: plugin.network,
        tokenAddress: plugin.tokenAddress,
      }),
    )

    deleteOperations.push(
      Models.Lock.deleteMany({
        network: plugin.network,
        escrowAddress: plugin.votingEscrow?.escrowAddress,
      }),
    )

    const configIndexerServices = [
      ConfigIndexerHelper.builders.plugin(plugin.interfaceType, plugin.network, plugin.address),
      ConfigIndexerHelper.builders.token(ITokenType.escrowAdapter, plugin.network, plugin.votingEscrow?.escrowAddress!),
    ]

    for (const service of configIndexerServices) {
      deleteOperations.push(
        Models.ConfigIndexer.deleteMany({
          network: plugin.network,
          service,
        }),
      )
    }

    const results = await Promise.allSettled(deleteOperations)

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        logger.info(
          `Delete operation ${index + 1} completed`,
          llo({
            deletedCount: result.value?.deletedCount || 0,
          }),
        )
      } else {
        logger.error(
          `Delete operation ${index + 1} failed`,
          llo({
            error: result.reason,
          }),
        )
      }
    })

    logger.info(
      'Cleanup completed for plugin',
      llo({
        pluginId: plugin.id,
        pluginAddress: plugin.address,
        totalOperations: deleteOperations.length,
      }),
    )
  },

  stop: () => {
    logger.info('FixBrokenLockMember tool stopped', llo())
  },
}
