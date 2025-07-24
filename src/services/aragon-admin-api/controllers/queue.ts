import {
  type IAQueueDao,
  type IAQueueProposal,
  type IAQueueToken,
  IPluginInterfaceType,
  type NetworksEnum,
} from '@src/types'
import { Models } from '@dbModels'
import { EnumQueueName, ErrorKeyEnum, IPluginStatus } from '@types'
import { assertExposable } from '@errors'
import type Plugin from '@models/schema/plugin'
import { PluginSlug } from '@helpers/pluginSlug'
import logger from '@logger'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'QueueAdminController' })

const QueueAdminController = {
  queuePlugins: async (params: IAQueueDao): Promise<any> => {
    const dao = await Models.Dao.findByAddress(params.address, params.network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    const plugins = await Models.Plugin.find({
      daoAddress: params.address,
      network: params.network,
      isSupported: true,
      status: IPluginStatus.installed,
    })

    await Promise.all(
      plugins.map(async (plugin: Plugin) => {
        const pluginSlug = await Models.PluginSlug.findOne({
          pluginAddress: plugin.address,
          network: plugin.network,
        })

        if (!pluginSlug) {
          await PluginSlug.generateSlug(plugin, plugin?.processKey)
          logger.verbose('Force queue generate slug plugin', llo({ address: plugin.address, network: plugin.network }))
        }

        await RabbitMQHelper.sendMessage(EnumQueueName.requeue, {
          id: plugin.address,
          params: { address: plugin.address, network: plugin.network },
        })

        logger.verbose('Force queue plugin', llo({ address: plugin.address, network: plugin.network }))
      }),
    )

    return true
  },

  queueDaoAssets: async (params: IAQueueDao): Promise<any> => {
    const dao = await Models.Dao.findByAddress(params.address, params.network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    await RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
      id: dao.address,
      params: { address: dao.address, network: dao.network },
    })

    logger.verbose('Force queue dao assets', llo({ address: params.address, network: params.network }))
    return true
  },

  queueDaoTransactions: async (params: IAQueueDao): Promise<any> => {
    const dao = await Models.Dao.findByAddress(params.address, params.network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    await RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
      id: dao.address,
      params: { address: dao.address, network: dao.network },
    })

    logger.verbose('Force queue dao transactions', llo({ address: params.address, network: params.network }))
    return true
  },

  queueDaoMetrics: async (params: IAQueueDao): Promise<any> => {
    const dao = await Models.Dao.findByAddress(params.address, params.network)
    assertExposable(dao, ErrorKeyEnum.notFound)

    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: dao.address,
      params: { address: dao.address, network: dao.network },
    })

    logger.verbose('Force queue dao metrics', llo({ address: params.address, network: params.network }))
    return true
  },

  queueProposalMetrics: async (params: IAQueueProposal): Promise<any> => {
    const plugin = await Models.Plugin.findOne({
      address: params.pluginAddress,
      network: params.network,
      isSupported: true,
      status: IPluginStatus.installed,
      interfaceType: { $in: [IPluginInterfaceType.tokenVoting, IPluginInterfaceType.multisig] },
    })

    assertExposable(plugin, ErrorKeyEnum.notFound)

    const proposal = await Models.Proposal.findOne({
      proposalIndex: params.proposalIndex,
      pluginAddress: params.pluginAddress,
      network: params.network,
    })

    assertExposable(proposal, ErrorKeyEnum.notFound)

    const id = `${params.proposalIndex}-${params.pluginAddress}`
    const rawQueueParams = {
      proposalIndex: params.proposalIndex,
      pluginAddress: params.pluginAddress,
      network: params.network,
    }
    const queueName =
      plugin.interfaceType === IPluginInterfaceType.tokenVoting
        ? EnumQueueName.proposalTokenVotingMetrics
        : EnumQueueName.proposalMultisigMetrics

    await RabbitMQHelper.sendMessage(queueName, {
      id,
      params: rawQueueParams,
    })

    logger.verbose(
      'Force queue proposal metrics',
      llo({ proposalIndex: params.proposalIndex, pluginAddress: params.pluginAddress, network: params.network }),
    )
    return true
  },

  recalculateProposalActions: async (params: {
    pluginAddress: string
    incrementalId: number
    network: NetworksEnum
  }): Promise<any> => {
    try {
      const plugin = await Models.Plugin.findByAddress(params.pluginAddress, params.network)
      assertExposable(plugin, ErrorKeyEnum.notFound)

      const proposal = await Models.Proposal.findByProposalIncrementalId(
        params.incrementalId,
        params.pluginAddress,
        params.network,
      )
      assertExposable(proposal, ErrorKeyEnum.notFound)

      await proposal.update({ decoding: true })

      await RabbitMQHelper.sendMessage(EnumQueueName.proposalActions, {
        id: proposal.id,
        params: {
          id: proposal.id,
          network: proposal.network,
        },
      })

      return {
        success: true,
        message: 'Proposal actions recalculated in the background',
        data: {
          proposalId: proposal.id,
          incrementalId: proposal.incrementalId,
          daoAddress: proposal.daoAddress,
          network: proposal.network,
          pluginAddress: proposal.pluginAddress,
          actionsCount: proposal.actions?.length || 0,
        },
      }
    } catch (error) {
      logger.error('Error recalculating proposal actions', llo({ error, params }))
      return false
    }
  },

  resetAndForceSyncToken: async (params: IAQueueToken): Promise<any> => {
    const token = await Models.Token.findByTokenAddressAndNetwork(params.address, params.network)
    if (!token) return

    // take all plugins with the same token address and network
    const plugins = await Models.Plugin.find({
      tokenAddress: params.address,
      network: params.network,
    })

    await Promise.all([
      Models.MemberTransaction.deleteMany({
        tokenAddress: params.address,
        network: params.network,
      }),
      Models.MemberBalance.deleteMany({
        tokenAddress: params.address,
        network: params.network,
      }),
    ])

    await Promise.all(
      plugins.map(async (p: Plugin) => {
        const service = `${IPluginInterfaceType.tokenVoting}-${p.network}-${p.address}-${p.tokenAddress}`
        const configIndexer = await Models.ConfigIndexer.findOne({ service })

        if (!configIndexer) {
          logger.error('No config indexer found', llo({ params, service }))
          return
        }
        await configIndexer.deleteOne()

        await Models.DaoMemberMapping.deleteMany({
          pluginAddress: p.address,
          tokenAddress: p.tokenAddress,
          network: p.network,
        })
        await Models.MemberMetrics.deleteMany({
          pluginAddress: p.address,
          network: p.network,
        })

        if (token) {
          await token.deleteOne()
        }

        if (p.tokenAddress) {
          logger.verbose('Force re-sync plugin', llo({ address: params.address, network: params.network }))
        }

        // re-sync from scratch
        await RabbitMQHelper.sendMessage(EnumQueueName.requeue, {
          id: p.address,
          params: { address: p.address, network: p.network },
        })
      }),
    )
  },
}

export default QueueAdminController
