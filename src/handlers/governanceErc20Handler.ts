import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, type ILogInfo, IPluginInterfaceType, type NetworksEnum } from '@types'
import utils from '@helpers/utils'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import { Erc20Governance } from '@modules/memberGovernance/erc20Governance'
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
      const { delegate: memberAddress } = parsedEvent.args

      if (memberAddress === utils.zeroAddress) return

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTransfer token not found', llo({ info }))
        return
      }

      const newBalance = BigInt(parsedEvent?.args?.newBalance || 0)
      const lastActivity = info.blockNumber

      // Create base member using MemberGovernanceFactory
      await MemberGovernanceFactory.createBaseMember(memberAddress, lastActivity)

      // Create ERC20 governance instance for token operations
      const governance = MemberGovernanceFactory.create({
        address: info.address, // token address
        network: info.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
      })

      await governance.getOrCreate(memberAddress)
      // Update token member voting power
      await governance.update(memberAddress, {
        votingPower: newBalance.toString(),
        lastActivity: info.blockNumber,
      })

      // Update plugin metrics for all plugins using this token
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          await governance.getOrCreatePluginMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: plugin.network,
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

      // Group events by member to handle each member's updates together
      const eventsByMember = new Map<string, Array<{ parsedEvent: LogDescription; info: ILogInfo }>>()

      // Use for...of loop for better performance
      for (const event of validEvents) {
        const memberAddress = event.parsedEvent.args.delegate.toLowerCase()
        const existing = eventsByMember.get(memberAddress)
        if (existing) {
          existing.push(event)
        } else {
          eventsByMember.set(memberAddress, [event])
        }
      }

      // Process each member's events to get only the latest
      const latestEventsPerMember: Array<{ parsedEvent: LogDescription; info: ILogInfo }> = []

      // Use for...of with Map entries for better performance
      for (const [, memberEvents] of eventsByMember) {
        // Find the event with the highest block number without sorting the entire array
        let latestEvent = memberEvents[0]
        for (let i = 1; i < memberEvents.length; i++) {
          if (memberEvents[i].info.blockNumber > latestEvent.info.blockNumber) {
            latestEvent = memberEvents[i]
          }
        }
        latestEventsPerMember.push(latestEvent)
      }

      // Try batch operation without transaction for parallel processing
      // Transactions cause conflicts when multiple batches run in parallel
      try {
        // Prepare batch data for members
        const memberData = latestEventsPerMember.map(({ parsedEvent, info }) => ({
          memberAddress: parsedEvent.args.delegate,
          lastActivity: info.blockNumber,
        }))

        // Create/update base members in batch without session (no transaction)
        await Erc20Governance.createMembersBatchNoTx(memberData)

        // Group updates by token-network to create governance instances
        const updatesByTokenNetwork = new Map<
          string,
          Array<{
            memberAddress: string
            votingPower: string
            lastVPBlockNumber: number
          }>
        >()

        latestEventsPerMember.forEach(({ parsedEvent, info }) => {
          const key = `${info.address}-${info.network}`
          const update = {
            memberAddress: parsedEvent.args.delegate,
            votingPower: BigInt(parsedEvent?.args?.newBalance || 0).toString(),
            lastVPBlockNumber: info.blockNumber,
          }
          const existing = updatesByTokenNetwork.get(key)
          if (existing) {
            existing.push(update)
          } else {
            updatesByTokenNetwork.set(key, [update])
          }
        })

        // Update voting powers in batch for each token
        for (const [key, updates] of updatesByTokenNetwork) {
          const [tokenAddress, network] = key.split('-')
          const governance = new Erc20Governance(tokenAddress, network as NetworksEnum)
          await governance.updateTokenMemberVPBatchNoTx(updates)
        }

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

        // Update plugin metrics in batch without session
        if (pluginMetricsUpdates.length > 0) {
          // Group metrics updates by network to create governance instances
          const metricsByNetwork = new Map<
            NetworksEnum,
            Array<{
              memberAddress: string
              pluginAddress: string
              daoAddress?: string
              lastActivity?: number
            }>
          >()

          pluginMetricsUpdates.forEach(update => {
            const existing = metricsByNetwork.get(update.network)
            if (existing) {
              existing.push(update)
            } else {
              metricsByNetwork.set(update.network, [update])
            }
          })

          // Update metrics for each network using Erc20Governance
          // We use the first available token address for each network
          for (const [network, updates] of metricsByNetwork) {
            const tokenNetworkItem = uniqueTokenNetworks.find(item => item.network === network)
            if (tokenNetworkItem) {
              const governance = new Erc20Governance(tokenNetworkItem.tokenAddress, network)
              await governance.updatePluginMetricsBatchNoTx(updates)
            }
          }
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
      } catch (txError) {
        // If batch transaction fails, fall back to individual processing
        logger.warn(
          'Batch transaction failed, falling back to individual processing',
          llo({
            error: txError,
            eventCount: latestEventsPerMember.length,
          }),
        )

        // Process each member individually without transaction to ensure no data loss
        const failedMembers: string[] = []

        for (const event of latestEventsPerMember) {
          try {
            const { parsedEvent, info } = event
            const memberAddress = parsedEvent.args.delegate

            // Create/update base member using MemberGovernanceFactory
            await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

            // Create governance instance for token operations
            const governance = MemberGovernanceFactory.create({
              address: info.address, // token address
              network: info.network,
              interfaceType: IPluginInterfaceType.tokenVoting,
            })

            // Update voting power - this will only update if block number is higher
            await governance.getOrCreate(memberAddress)
            await governance.update(memberAddress, {
              votingPower: BigInt(parsedEvent?.args?.newBalance || 0).toString(),
              lastActivity: info.blockNumber,
            })

            // Update plugin metrics for this member
            const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
            if (plugins.length > 0) {
              await Promise.all(
                plugins.map(async (plugin: Plugin) => {
                  await governance.getOrCreatePluginMetrics({
                    memberAddress,
                    pluginAddress: plugin.address,
                    daoAddress: plugin.daoAddress,
                    network: plugin.network,
                    lastActivity: info.blockNumber,
                  })
                }),
              )
            }
          } catch (individualError) {
            logger.error(
              'Failed to process individual member',
              llo({
                error: individualError,
                memberAddress: event.parsedEvent.args.delegate,
                blockNumber: event.info.blockNumber,
              }),
            )
            failedMembers.push(event.parsedEvent.args.delegate)
          }
        }

        if (failedMembers.length > 0) {
          logger.error(
            'Some members failed to process',
            llo({
              failedMembers,
              totalFailed: failedMembers.length,
              totalProcessed: latestEventsPerMember.length,
            }),
          )
        } else {
          logger.info(
            'All members processed successfully via fallback',
            llo({
              totalProcessed: latestEventsPerMember.length,
            }),
          )
        }
      }
    } catch (error) {
      logger.error('DelegateVotesChangedBatch - error', llo({ error, eventCount: events.length }))
      throw error // Re-throw to ensure proper error handling
    }
  },
}
