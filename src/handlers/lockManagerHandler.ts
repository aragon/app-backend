import logger from '@logger'
import type { LogDescription } from 'ethers'
import type { ILogInfo } from '@types'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import { ProxyMember } from '@modules/proxyMember'
import { EnumQueueName } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import LockToVoteHelper from '@helpers/lockToVoteHelper'

const llo = logger.logMeta.bind(null, { service: 'service:handler:LockManagerHandler' })

const LockManagerHandler = {
  balanceLocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const voterAddress = parsedEvent.args.voter
    const eventAmount = parsedEvent.args.amount.toString()
    try {
      const plugin = await Models.Plugin.findOne({
        lockManagerAddress: info.address,
        network: info.network,
      })

      if (!plugin) {
        logger.warn('BalanceLocked - Plugin not found', llo(info))
        return
      }

      await ProxyMember.createMember(voterAddress)
      const pluginMember = await ProxyMember.getOrCreatePluginMember({
        memberAddress: voterAddress,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: plugin.network,
      })

      // Get the total locked balance from the contract
      const totalLockedBalance = await LockToVoteHelper.getUserLockedBalance(info.network, info.address, voterAddress)

      let totalLockedBalanceStr: string

      if (totalLockedBalance === null) {
        // Fallback: If we can't get balance from contract, sum the event amount to existing balance
        logger.warn(
          'BalanceLocked - Failed to get locked balance from contract, using fallback sum',
          llo({ ...info, voterAddress }),
        )

        if (pluginMember?.votingPower) {
          // Add event amount to existing voting power
          const currentPower = BigInt(pluginMember.votingPower || '0')
          const addAmount = BigInt(eventAmount)
          totalLockedBalanceStr = (currentPower + addAmount).toString()
        } else {
          // New member, use event amount as initial voting power
          totalLockedBalanceStr = eventAmount
        }
      } else {
        totalLockedBalanceStr = totalLockedBalance
      }

      await DbOperations.updateDocument(
        pluginMember,
        {
          votingPower: totalLockedBalanceStr,
        },
        info,
        'Update LockManager Member',
        llo,
      )

      await Promise.all([
        ProxyMember.updatePluginMetrics({
          memberAddress: voterAddress,
          pluginAddress: plugin.address,
          network: plugin.network,
          lastActivity: info.blockNumber,
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: info.network },
        }),
      ])

      logger.verbose(
        'Balance locked successfully',
        llo({ ...info, voterAddress, eventAmount, totalLockedBalance: totalLockedBalanceStr }),
      )
    } catch (error) {
      logger.error('Error BalanceLocked', llo({ ...info, error, parsedEvent }))
    }
  },

  balanceUnlocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const voterAddress = parsedEvent.args.voter
      const eventAmount = parsedEvent.args.amount.toString()

      const plugin = await Models.Plugin.findOne({
        lockManagerAddress: info.address,
        network: info.network,
      })

      if (!plugin) {
        logger.warn('BalanceUnlocked - Plugin not found', llo(info))
        return
      }

      await ProxyMember.createMember(voterAddress)
      const pluginMember = await ProxyMember.getOrCreatePluginMember({
        memberAddress: voterAddress,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: plugin.network,
      })

      // Get the total locked balance from the contract after unlock
      const totalLockedBalance = await LockToVoteHelper.getUserLockedBalance(info.network, info.address, voterAddress)

      let totalLockedBalanceStr: string

      if (totalLockedBalance === null) {
        // Fallback: If we can't get balance from contract, subtract the event amount from existing balance
        logger.warn(
          'BalanceUnlocked - Failed to get locked balance from contract, using fallback subtraction',
          llo({ ...info, voterAddress }),
        )

        if (pluginMember?.votingPower) {
          const currentPower = BigInt(pluginMember?.votingPower || '0')
          const unlockAmount = BigInt(eventAmount)
          const newPower = currentPower > unlockAmount ? currentPower - unlockAmount : BigInt(0)
          totalLockedBalanceStr = newPower.toString()
        } else {
          // should not happen use event amount as initial voting power
          // totalLockedBalanceStr = eventAmount
          logger.error('Error remove votingPower to not pre exiting one', llo({ ...info, voterAddress }))
          return
        }
      } else {
        totalLockedBalanceStr = totalLockedBalance
      }

      await DbOperations.updateDocument(
        pluginMember,
        {
          votingPower: totalLockedBalanceStr,
        },
        info,
        'Update LockManager Member',
        llo,
      )

      await Promise.all([
        ProxyMember.updatePluginMetrics({
          memberAddress: voterAddress,
          pluginAddress: plugin.address,
          network: plugin.network,
          lastActivity: info.blockNumber,
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: plugin.daoAddress,
          params: { address: plugin.daoAddress, network: info.network },
        }),
      ])

      logger.verbose(
        'Balance unlocked successfully',
        llo({ ...info, voterAddress, eventAmount, totalLockedBalance: totalLockedBalanceStr }),
      )
    } catch (error) {
      logger.error('Error BalanceUnlocked', llo({ ...info, error, parsedEvent }))
    }
  },
}

export default LockManagerHandler
