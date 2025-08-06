import logger from '@logger'
import type { LogDescription } from 'ethers'
import type { ILogInfo } from '@types'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
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

      const existingMember = await Models.LockManagerMember.findMemberByPlugin({
        network: info.network,
        pluginAddress: plugin.address,
        memberAddress: voterAddress,
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

        if (existingMember) {
          // Add event amount to existing voting power
          const currentPower = BigInt(existingMember.votingPower || '0')
          const addAmount = BigInt(eventAmount)
          totalLockedBalanceStr = (currentPower + addAmount).toString()
        } else {
          // New member, use event amount as initial voting power
          totalLockedBalanceStr = eventAmount
        }
      } else {
        // Convert to string to avoid precision loss in DB
        totalLockedBalanceStr = totalLockedBalance.toString()
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      if (existingMember) {
        await DbOperations.updateDocument(
          existingMember,
          {
            votingPower: totalLockedBalanceStr,
            transactionHash: info.transactionHash,
            blockNumber: info.blockNumber,
            blockTimestamp,
          },
          info,
          'Update LockManager Member',
          llo,
        )
      } else {
        const lockManagerMemberData = {
          network: info.network,
          pluginAddress: plugin.address,
          memberAddress: voterAddress,
          daoAddress: plugin.daoAddress,
          votingPower: totalLockedBalanceStr,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp,
        }

        await Promise.all([
          ProxyMember.createMember(voterAddress),
          Models.LockManagerMember.create(lockManagerMemberData),
        ])

        const memberShipParams = {
          memberAddress: voterAddress,
          daoAddress: plugin.daoAddress,
          network: info.network,
          pluginAddress: plugin.address,
        }

        const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
        if (!isMember) {
          await ProxyMember.addToDao(memberShipParams)
        }

        await Promise.all([
          ProxyMember.updateActivity({
            memberAddress: voterAddress,
            pluginAddress: plugin.address,
            blockNumber: info.blockNumber,
            network: info.network,
          }),
          ProxyMember.createMetrics({
            address: voterAddress,
            pluginAddress: plugin.address,
            network: info.network,
          }),
          RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: plugin.daoAddress,
            params: { address: plugin.daoAddress, network: info.network },
          }),
        ])
      }

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

      const existingMember = await Models.LockManagerMember.findMemberByPlugin({
        network: info.network,
        pluginAddress: plugin.address,
        memberAddress: voterAddress,
      })

      if (!existingMember) {
        logger.warn('BalanceUnlocked - Member not found', llo({ ...info, voterAddress }))
        return
      }

      // Get the total locked balance from the contract after unlock
      const totalLockedBalance = await LockToVoteHelper.getUserLockedBalance(info.network, info.address, voterAddress)

      let totalLockedBalanceStr: string

      if (totalLockedBalance === null) {
        // Fallback: If we can't get balance from contract, subtract the event amount from existing balance
        logger.warn(
          'BalanceUnlocked - Failed to get locked balance from contract, using fallback subtraction',
          llo({ ...info, voterAddress }),
        )

        const currentPower = BigInt(existingMember.votingPower || '0')
        const unlockAmount = BigInt(eventAmount)
        const newPower = currentPower > unlockAmount ? currentPower - unlockAmount : BigInt(0)
        totalLockedBalanceStr = newPower.toString()
      } else {
        // Convert to string to avoid precision loss in DB
        totalLockedBalanceStr = totalLockedBalance.toString()
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      await DbOperations.updateDocument(
        existingMember,
        {
          votingPower: totalLockedBalanceStr,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp,
        },
        info,
        'Update LockManager Member',
        llo,
      )

      // Only remove from DAO if the member has no more locked tokens
      if (totalLockedBalanceStr === '0') {
        const memberShipParams = {
          memberAddress: voterAddress,
          daoAddress: plugin.daoAddress,
          network: info.network,
          pluginAddress: plugin.address,
        }

        const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
        if (isMember) {
          await ProxyMember.removeFromDao(memberShipParams)
        }
      }

      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: plugin.daoAddress,
        params: { address: plugin.daoAddress, network: info.network },
      })

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
