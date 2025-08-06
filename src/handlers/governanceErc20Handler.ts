import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, type ILogInfo } from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import type Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ProxyToken } from '@modules/proxyToken'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceErc20Handler' })

export const GovernanceErc20Handler = {
  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    try {
      const memberAddress = parsedEvent.args.delegate
      const network = info.network

      if (memberAddress === utils.zeroAddress) return

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTransfer token not found', llo({ info }))
        return
      }

      const newBalance = BigInt(parsedEvent?.args?.newBalance || 0)
      const lastActivity = info.blockNumber

      await ProxyMember.createMember(memberAddress, lastActivity)
      await ProxyMember.updateVotingPower({
        memberAddress,
        tokenAddress: info.address,
        votingPower: newBalance.toString(),
        network: info.network,
        lastVPBlockNumber: info.blockNumber,
      })

      // update lastActivity metrics for all plugins
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          await ProxyMember.updatePluginMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
      await Promise.all(
        uniqueDaoList.map(async (daoAddress: string) => {
          await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: daoAddress,
            params: { address: daoAddress, network: info.network },
          })
        }),
      )
    } catch (error) {
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
    }
  },

  // Batch version to handle multiple delegate votes changed events
  delegateVotesChangedBatch: async (events: Array<{ parsedEvent: LogDescription; info: ILogInfo }>) => {
    try {
      // Filter out zero addresses and prepare data
      const validEvents = events.filter(({ parsedEvent }) => parsedEvent.args.delegate !== utils.zeroAddress)

      if (validEvents.length === 0) return

      // Sort events by block number descending and reduce to get only latest per member
      const latestEventsPerMember = validEvents
        .sort((a, b) => b.info.blockNumber - a.info.blockNumber)
        .reduce((acc: Array<{ parsedEvent: LogDescription; info: ILogInfo }>, event) => {
          const memberAddress = event.parsedEvent.args.delegate
          // Check if we already have this member (since we sorted, first occurrence is the latest)
          const alreadyProcessed = acc.some(e => e.parsedEvent.args.delegate === memberAddress)
          if (!alreadyProcessed) {
            acc.push(event)
          }
          return acc
        }, [])

      // Prepare batch data for members
      const memberData = latestEventsPerMember.map(({ parsedEvent, info }) => ({
        memberAddress: parsedEvent.args.delegate,
        lastActivity: info.blockNumber,
      }))

      // Create/update members in batch
      await ProxyMember.createMembersBatch(memberData)

      // Prepare voting power updates
      const vpUpdates = latestEventsPerMember.map(({ parsedEvent, info }) => ({
        memberAddress: parsedEvent.args.delegate,
        tokenAddress: info.address,
        votingPower: BigInt(parsedEvent?.args?.newBalance || 0).toString(),
        network: info.network,
        lastVPBlockNumber: info.blockNumber,
      }))

      // Update voting powers in batch
      await ProxyMember.updateVotingPowerBatch(vpUpdates)

      // Get unique token-network combinations using reduce
      const uniqueTokenNetworks = latestEventsPerMember.reduce<Array<{ tokenAddress: string; network: string }>>(
        (acc, { info }) => {
          const key = `${info.address}-${info.network}`
          if (!acc.some(item => `${item.tokenAddress}-${item.network}` === key)) {
            acc.push({ tokenAddress: info.address, network: info.network })
          }
          return acc
        },
        [],
      )

      // Fetch all plugins for all unique token-network combinations
      const pluginPromises = uniqueTokenNetworks.map(({ tokenAddress, network }) =>
        Models.Plugin.findAllByTokenAddress(tokenAddress, network),
      )
      const pluginArrays = await Promise.all(pluginPromises)
      const allPlugins = pluginArrays.flat()

      // Create a map of token-network to plugins for quick lookup using reduce
      const pluginMap = allPlugins.reduce<Record<string, Plugin[]>>((map, plugin) => {
        const key = `${plugin.tokenAddress}-${plugin.network}`
        if (!map[key]) {
          map[key] = []
        }
        map[key].push(plugin)
        return map
      }, {})

      // Prepare plugin metrics updates using flatMap
      const pluginMetricsUpdates = latestEventsPerMember.flatMap(({ parsedEvent, info }) => {
        const key = `${info.address}-${info.network}`
        const plugins = pluginMap[key] || []

        return plugins.map(plugin => ({
          memberAddress: parsedEvent.args.delegate,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: info.network,
          lastActivity: info.blockNumber,
        }))
      })

      // Update plugin metrics in batch
      if (pluginMetricsUpdates.length > 0) {
        await ProxyMember.updatePluginMetricsBatch(pluginMetricsUpdates)
      }

      // Collect unique DAOs for metrics messages using reduce
      const uniqueDaos = allPlugins.reduce<Array<{ daoAddress: string; network: string }>>((acc, plugin) => {
        const key = `${plugin.daoAddress}-${plugin.network}`
        if (!acc.some(item => `${item.daoAddress}-${item.network}` === key)) {
          acc.push({ daoAddress: plugin.daoAddress, network: plugin.network })
        }
        return acc
      }, [])

      // Send DAO metrics messages
      const daoMessages = uniqueDaos.map(async ({ daoAddress, network }) =>
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: daoAddress,
          params: { address: daoAddress, network },
        }),
      )

      if (daoMessages.length > 0) {
        await Promise.all(daoMessages)
      }
    } catch (error) {
      logger.error('DelegateVotesChangedBatch - error', llo({ error, eventCount: events.length }))
    }
  },
}
