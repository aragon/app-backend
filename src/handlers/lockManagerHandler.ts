import logger from '@logger'
import type { LogDescription } from 'ethers'
import type { ILogInfo } from '@types'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import DbOperations from '@models/utils/dbOperations'
import { ProxyMember } from '@modules/proxyMember'
import { EnumQueueName } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'service:handler:LockManagerHandler' })

const LockManagerHandler = {
  balanceLocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const voterAddress = parsedEvent.args.voter
    const amount = parsedEvent.args.amount.toString()
    try {
      const plugin = await Models.Plugin.findByAddress(info.address, info.network)
      if (!plugin) {
        logger.warn('BalanceLocked - Plugin not found', llo(info))
        return
      }

      const existingMember = await Models.LockManagerMember.findMemberByPlugin({
        network: info.network,
        pluginAddress: info.address,
        memberAddress: voterAddress,
      })

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      if (existingMember) {
        await DbOperations.updateDocument(
          existingMember,
          {
            votingPower: amount,
            transactionHash: info.transactionHash,
            blockNumber: info.blockNumber,
            blockTimestamp,
            isActive: true,
          },
          info,
          'Update LockManager Member',
          llo,
        )
      } else {
        const lockManagerMemberData = {
          network: info.network,
          pluginAddress: info.address,
          memberAddress: voterAddress,
          daoAddress: plugin.daoAddress,
          votingPower: amount,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp,
          isActive: true,
        }

        await Promise.all([
          ProxyMember.createMember(voterAddress),
          Models.LockManagerMember.create(lockManagerMemberData),
        ])

        const memberShipParams = {
          memberAddress: voterAddress,
          daoAddress: plugin.daoAddress,
          network: info.network,
          pluginAddress: info.address,
        }

        const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
        if (!isMember) {
          await ProxyMember.addToDao(memberShipParams)
        }

        await Promise.all([
          ProxyMember.updateActivity({
            memberAddress: voterAddress,
            pluginAddress: info.address,
            blockNumber: info.blockNumber,
            network: info.network,
          }),
          ProxyMember.createMetrics({
            address: voterAddress,
            pluginAddress: info.address,
            network: info.network,
          }),
          RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: plugin.daoAddress,
            params: { address: plugin.daoAddress, network: info.network },
          }),
        ])
      }

      logger.verbose('Balance locked successfully', llo({ ...info, voterAddress, amount }))
    } catch (error) {
      logger.error('Error BalanceLocked', llo({ ...info, error, parsedEvent }))
    }
  },

  balanceUnlocked: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const voterAddress = parsedEvent.args.voter
      const amount = parsedEvent.args.amount.toString()

      const plugin = await Models.Plugin.findByAddress(info.address, info.network)
      if (!plugin) {
        logger.warn('BalanceUnlocked - Plugin not found', llo(info))
        return
      }

      const existingMember = await Models.LockManagerMember.findMemberByPlugin({
        network: info.network,
        pluginAddress: info.address,
        memberAddress: voterAddress,
      })

      if (!existingMember) {
        logger.warn('BalanceUnlocked - Member not found', llo({ ...info, voterAddress }))
        return
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      await DbOperations.updateDocument(
        existingMember,
        {
          votingPower: '0',
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
          blockTimestamp,
          isActive: false,
        },
        info,
        'Deactivate LockManager Member',
        llo,
      )

      const memberShipParams = {
        memberAddress: voterAddress,
        daoAddress: plugin.daoAddress,
        network: info.network,
        pluginAddress: info.address,
      }

      const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
      if (isMember) {
        await ProxyMember.removeFromDao(memberShipParams)
      }

      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: plugin.daoAddress,
        params: { address: plugin.daoAddress, network: info.network },
      })

      logger.verbose('Balance unlocked successfully', llo({ ...info, voterAddress, amount }))
    } catch (error) {
      logger.error('Error BalanceUnlocked', llo({ ...info, error, parsedEvent }))
    }
  },
}

export default LockManagerHandler
