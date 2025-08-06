import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, type ILogInfo } from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import type Plugin from '@models/schema/plugin'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ProxyToken } from '@modules/proxyToken'
import DbTx from '@modules/dbTx'

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

      // First, try batch operation with transaction for better performance
      try {
        await DbTx.executeTxFn(async ({ session }) => {
          // Prepare batch data for members
          const memberData = latestEventsPerMember.map(({ parsedEvent, info }) => ({
            memberAddress: parsedEvent.args.delegate,
            lastActivity: info.blockNumber,
          }))

          // Create/update members in batch with session
          await ProxyMember.createMembersBatchWithSession(memberData, session)

          // Prepare voting power updates
          const vpUpdates = latestEventsPerMember.map(({ parsedEvent, info }) => ({
            memberAddress: parsedEvent.args.delegate,
            tokenAddress: info.address,
            votingPower: BigInt(parsedEvent?.args?.newBalance || 0).toString(),
            network: info.network,
            lastVPBlockNumber: info.blockNumber,
          }))

          // Update voting powers in batch with session
          await ProxyMember.updateVotingPowerBatchWithSession(vpUpdates, session)

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
            Models.Plugin.findAllByTokenAddress(tokenAddress, network, { session }),
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

          // Update plugin metrics in batch with session
          if (pluginMetricsUpdates.length > 0) {
            await ProxyMember.updatePluginMetricsBatchWithSession(pluginMetricsUpdates, session)
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
        }) // End of transaction
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

            // Create/update member
            await ProxyMember.createMembersBatch([
              {
                memberAddress,
                lastActivity: info.blockNumber,
              },
            ])

            // Update voting power - this will only update if block number is higher
            await ProxyMember.updateVotingPowerBatch([
              {
                memberAddress,
                tokenAddress: info.address,
                votingPower: BigInt(parsedEvent?.args?.newBalance || 0).toString(),
                network: info.network,
                lastVPBlockNumber: info.blockNumber,
              },
            ])

            // Update plugin metrics for this member
            const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
            if (plugins.length > 0) {
              const metricsUpdates = plugins.map(plugin => ({
                memberAddress,
                pluginAddress: plugin.address,
                daoAddress: plugin.daoAddress,
                network: info.network,
                lastActivity: info.blockNumber,
              }))

              await ProxyMember.updatePluginMetricsBatch(metricsUpdates)
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
