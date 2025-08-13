import logger from '@logger'
import type { LogDescription } from 'ethers'
import type { ILogInfo } from '@types'
import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import { EnumQueueName, IPluginInterfaceType } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import type Plugin from '@models/schema/plugin'
import utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'service:handler:LockManagerHandler' })

const LockManagerHandler = {
  balanceLocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const network = info.network
    const lockManagerAddress = info.address
    const memberAddress = parsedEvent.args.voter
    const eventAmount = parsedEvent.args.amount.toString()

    try {
      const plugins = await Models.Plugin.find({
        lockManagerAddress,
        network,
      })
      if (!plugins || plugins.length === 0) return

      // Get the total locked balance from the contract
      const totalLockedBalance = await LockToVoteHelper.getUserLockedBalance(network, lockManagerAddress, memberAddress)

      // Create base member using MemberGovernanceFactory
      await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

      // Create LockToVote governance instance
      const governance = MemberGovernanceFactory.create({
        address: lockManagerAddress,
        network: info.network,
        interfaceType: IPluginInterfaceType.lockToVote,
      })
      // Get or create lock manager member
      await governance.getOrCreate(memberAddress)

      let votingPower: string

      if (totalLockedBalance === null) {
        // Fallback: If we can't get balance from contract, sum the event amount to existing balance
        logger.warn(
          'BalanceLocked - Failed to get locked balance from contract, using fallback sum',
          llo({ ...info, memberAddress }),
        )
        const lockManager = await governance.findOne(memberAddress)

        if (lockManager?.votingPower) {
          // Add event amount to existing voting power
          const currentPower = BigInt(lockManager.votingPower || '0')
          const addAmount = BigInt(eventAmount)
          votingPower = (currentPower + addAmount).toString()
        } else {
          // New member, use event amount as initial voting power
          votingPower = eventAmount
        }
      } else {
        votingPower = totalLockedBalance
      }

      // Update lock manager member voting power
      await governance.update(memberAddress, {
        votingPower: votingPower.toString(),
        lastActivity: info.blockNumber,
      })

      // Update plugin metrics for all plugins
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          await governance.getOrCreatePluginMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      await governance.updateDaoMetrics()

      logger.verbose(
        'Balance locked successfully',
        llo({ ...info, memberAddress, eventAmount, totalLockedBalance: votingPower }),
      )
    } catch (error) {
      logger.error('Error BalanceLocked', llo({ ...info, error, parsedEvent }))
    }
  },

  balanceUnlocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const network = info.network
      const lockManagerAddress = info.address
      const memberAddress = parsedEvent.args.voter
      const eventAmount = parsedEvent.args.amount.toString()

      const plugins = await Models.Plugin.find({
        lockManagerAddress,
        network,
      })
      if (!plugins || plugins.length === 0) return

      // Get the total locked balance from the contract
      const totalLockedBalance = await LockToVoteHelper.getUserLockedBalance(network, lockManagerAddress, memberAddress)

      // Create LockToVote governance instance
      const governance = MemberGovernanceFactory.create({
        address: lockManagerAddress,
        network: info.network,
        interfaceType: IPluginInterfaceType.lockToVote,
      })

      let votingPower: string

      if (totalLockedBalance === null) {
        // Fallback: If we can't get balance from contract, subtract the event amount from existing balance
        logger.warn(
          'BalanceUnlocked - Failed to get locked balance from contract, using fallback subtraction',
          llo({ ...info, memberAddress }),
        )

        // Get lock manager member
        const lockManager = await governance.findOne(memberAddress)

        if (lockManager?.votingPower) {
          const currentPower = BigInt(lockManager?.votingPower || '0')
          const unlockAmount = BigInt(eventAmount)
          const newPower = currentPower > unlockAmount ? currentPower - unlockAmount : BigInt(0)
          votingPower = newPower.toString()
        } else {
          // should not happen use event amount as initial voting power
          // votingPower = eventAmount
          logger.error('Error remove votingPower to not pre exiting one', llo({ ...info, memberAddress }))
          return
        }
      } else {
        votingPower = totalLockedBalance
      }

      await governance.getOrCreate(memberAddress)
      // Update lock manager member voting power
      await governance.update(memberAddress, {
        votingPower: votingPower.toString(),
        lastActivity: info.blockNumber,
      })

      // Update plugin metrics for all plugins
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          await governance.getOrCreatePluginMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      await governance.updateDaoMetrics()

      logger.verbose(
        'Balance unlocked successfully',
        llo({ ...info, memberAddress, eventAmount, totalLockedBalance: votingPower }),
      )
    } catch (error) {
      logger.error('Error BalanceUnlocked', llo({ ...info, error, parsedEvent }))
    }
  },
}

export default LockManagerHandler
