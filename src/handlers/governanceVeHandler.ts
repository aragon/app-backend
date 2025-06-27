import logger from '@logger'
import { type LogDescription } from 'ethers'
import { type HexAddress, type ILogInfo } from '@types'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'
import Web3Helper from '@helpers/web3'
import { EnumQueueName, ITransferSide, ITransferType } from '@types'
import utils from '@helpers/utils'
import DbTx from '@modules/dbTx'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ProxyToken } from '@modules/proxyToken'
import GovernanceErc20Helper from '@src/helpers/governanceErc20'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceVeHandler' })

export const GovernanceVeHandler = {
  delegateTokens: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    const fromAddress = parsedEvent.args.sender
    const toAddress = parsedEvent.args.delegatee
    const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

    try {
      await GovernanceVeHandler._handleTokenDelegation(
        parsedEvent,
        info,
        fromAddress,
        ITransferSide.outgoing,
        plugins,
        tokenIds,
      )

      await GovernanceVeHandler._handleTokenDelegation(
        parsedEvent,
        info,
        toAddress,
        ITransferSide.incoming,
        plugins,
        tokenIds,
      )

      logger.verbose('Delegate tokens VeGovernance', llo({ info, fromAddress, toAddress, tokenIds }))
    } catch (error) {
      logger.error('DelegateTokens error', llo({ error, info, fromAddress, toAddress }))
    }
  },

  unDelegateTokens: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    const toAddress = parsedEvent.args.sender
    const fromAddress = parsedEvent.args.delegatee
    const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

    try {
      await GovernanceVeHandler._handleTokenDelegation(
        parsedEvent,
        info,
        fromAddress,
        ITransferSide.outgoing,
        plugins,
        tokenIds,
      )

      await GovernanceVeHandler._handleTokenDelegation(
        parsedEvent,
        info,
        toAddress,
        ITransferSide.incoming,
        plugins,
        tokenIds,
      )

      logger.verbose('Undelegate tokens VeGovernance', llo({ info, fromAddress, toAddress, tokenIds }))
    } catch (error) {
      logger.error('UnDelegateTokens error', llo({ error, info, fromAddress, toAddress }))
    }
  },

  _handleTokenDelegation: async (
    parsedEvent: LogDescription,
    info: ILogInfo,
    memberAddress: string,
    transferSide: ITransferSide,
    plugins: any[],
    tokenIds: string[],
  ) => {
    try {
      await ProxyMember.createMember(memberAddress)

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTokenDelegation token not found', llo({ info }))
        return
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)
      const tokenAmount = tokenIds.length.toString()

      let tokenBalanceDb = await ProxyMember.getBalances({
        address: memberAddress,
        tokenAddress: info.address,
        network: info.network,
      })

      const votingPower = await GovernanceErc20Helper.getPastVotes(
        memberAddress,
        info.address,
        info.blockNumber,
        blockTimestamp || 0,
        info.network,
        token.hasClockMode,
      )

      const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
        const tokenBalanceFuncName = transferSide === ITransferSide.incoming ? 'increaseBalance' : 'decreaseBalance'
        tokenBalanceDb = await tokenBalanceDb?.[tokenBalanceFuncName](
          {
            amount: tokenAmount,
            blockNumber: info.blockNumber,
            tokenId: Number(tokenIds[0]),
          },
          { session },
        )

        const memberTransaction = await Models.MemberTransaction.create(
          {
            network: info.network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
            blockTimestamp,
            address: memberAddress,
            type: ITransferType.delegate,
            side: transferSide,
            from: parsedEvent.args.sender,
            to: parsedEvent.args.delegatee,
            amount: tokenAmount,
            tokenAddress: info.address,
            memberBalance: tokenBalanceDb?.amount,
            memberVotingPower: votingPower.toString(),
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()
        return memberTransaction
      })
      await GovernanceVeHandler._handleDaoMemberShip(memberTransaction, plugins, info)

      await Promise.all(
        plugins.map(async (plugin: any) => {
          await ProxyMember.updateDelegationMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            tokenAddress: info.address,
            network: info.network,
          })

          await ProxyMember.updateActivity({
            memberAddress,
            pluginAddress: plugin.address,
            blockNumber: info.blockNumber,
            network: info.network,
          })
        }),
      )
    } catch (error) {
      logger.error('Error handling token delegation', llo({ error, info, memberAddress, transferSide, tokenIds }))
    }
  },

  _handleDaoMemberShip: async (memberTx: any, plugins: any[], info: ILogInfo) => {
    const userBalance = BigInt(memberTx.votingPower || '0')

    await Promise.all([
      ...plugins.map(async (plugin: any) => {
        const memberShipParams = {
          memberAddress: memberTx.address,
          daoAddress: plugin.daoAddress,
          network: plugin.network,
          pluginAddress: plugin.address,
          tokenAddress: plugin.tokenAddress,
        }

        const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
        const meetsRequirements = userBalance > 0n

        if (!isMember && meetsRequirements) {
          await ProxyMember.addToDao(memberShipParams)
        } else if (isMember && !meetsRequirements) {
          await ProxyMember.removeFromDao(memberShipParams)
        }
      }),
    ])

    const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
    await Promise.all(
      uniqueDaoList.map(async (daoAddress: string) => {
        await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: daoAddress,
          params: { address: daoAddress, network: info.network },
        })
      }),
    )
  },

  deposit: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.error('Plugin not found for deposit event', llo({ info }))
      return
    }

    /**
     * Extracting addresses from the first plugin
     * since they are expected to be the same across all plugins
     */

    const escrowAddress = plugins[0].votingEscrow.escrowAddress
    const tokenAddress = plugins[0].tokenAddress
    const nftLockAddress = plugins[0].votingEscrow.nftLockAddress
    const exitQueueAddress = plugins[0].votingEscrow.exitQueueAddress

    const memberAddress = parsedEvent.args.depositor
    const tokenId = parsedEvent.args.tokenId.toString()
    const amount = parsedEvent.args.value.toString()
    const epochStartAt = Number(parsedEvent.args.startTs)
    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
    const totalLocked = parsedEvent.args.newTotalLocked.toString()

    await ProxyMember.createMember(memberAddress)

    const lockParams = {
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      tokenAddress: plugins[0].tokenAddress,
      memberAddress,
      tokenId,
      escrowAddress,
    }

    const existingLock = await Models.Lock.findExistingLog(lockParams)

    if (!existingLock) {
      await Models.Lock.create({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        blockNumber: info.blockNumber,
        blockTimestamp,
        escrowAddress,
        memberAddress,
        nftAddress: nftLockAddress,
        tokenAddress,
        tokenId,
        amount,
        epochStartAt,
        totalLocked,
        exitQueueAddress,
      })

      logger.verbose(
        'Deposit VeGovernance - Lock created',
        llo({ info, memberAddress, tokenId, escrow: escrowAddress }),
      )
    } else {
      logger.warn(
        'Deposit VeGovernance - Lock already exists',
        llo({ info, memberAddress, tokenId, escrow: escrowAddress }),
      )
    }

    await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins, memberAddress, info, true)
  },

  withdraw: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.error('Plugin not found for withdraw event', llo({ info }))
      return
    }

    const escrowAddress = info.address

    const memberAddress = parsedEvent.args.depositor
    const tokenId = parsedEvent.args.tokenId.toString()
    const amount = parsedEvent.args.value.toString()
    const epochEndAt = Number(parsedEvent.args.ts)
    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
    const totalLocked = parsedEvent.args.newTotalLocked.toString()

    const memberLockParams = {
      escrowAddress,
      network: info.network,
      memberAddress,
      tokenId,
    }

    const existingLock = await Models.Lock.findLockMember(memberLockParams)
    if (!existingLock) {
      logger.error(
        'Lock not found for withdraw event',
        llo({
          info,
          memberAddress,
          tokenId,
          escrowAddress,
        }),
      )
      return
    }

    await existingLock.update({
      lockWithdraw: {
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp,
        totalLocked,
        amount,
        epochEndAt,
      },
    })

    logger.verbose('Withdraw VeGovernance', llo({ info, memberAddress, tokenId }))

    await GovernanceVeHandler._handleDaoMemberShipOnLockEvents(plugins, memberAddress, info, false)
  },

  _handleDaoMemberShipOnLockEvents: async (
    plugins: Plugin[],
    memberAddress: HexAddress,
    info: ILogInfo,
    addToDao: boolean,
  ) => {
    await Promise.all(
      plugins.map(async (plugin: any) => {
        const memberShipParams = {
          memberAddress,
          daoAddress: plugin.daoAddress,
          network: plugin.network,
          pluginAddress: plugin.address,
          tokenAddress: plugin.tokenAddress,
        }

        const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
        if (addToDao && !isMember) {
          await ProxyMember.addToDao(memberShipParams)
        }

        if (!addToDao && isMember) {
          await ProxyMember.removeFromDao(memberShipParams)
        }
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
  },

  exitQueued: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.exitQueueAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.error('Plugin not found for exitQueued event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.holder
    const tokenId = parsedEvent.args.tokenId.toString()
    const exitDateAt = Number(parsedEvent.args.exitDate)
    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined

    const memberLock = await Models.Lock.findLockMember({
      network: info.network,
      exitQueueAddress: info.address,
      tokenId,
      memberAddress,
    })

    if (!memberLock) {
      logger.error(
        'Lock not found for exitQueued event',
        llo({
          info,
          memberAddress,
          tokenId,
        }),
      )
      return
    }

    await memberLock.update({
      lockExit: {
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp,
        exitDateAt,
      },
    })

    logger.verbose('Exit queued VeGovernance', llo({ info, memberAddress, tokenId }))
  },

  minDepositSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.error('Plugin not found for minDepositSet event', llo({ info }))
      return
    }

    await Promise.all(
      plugins.map(async (plugin: any) => {
        const activePluginSetting = await Models.Setting.findActive({
          network: info.network,
          pluginAddress: plugin.address,
        })

        if (!activePluginSetting) {
          logger.error(
            'Active plugin setting not found for minDepositSet event',
            llo({
              info,
              pluginAddress: plugin.address,
            }),
          )
          return
        }

        activePluginSetting.votingEscrow.minDeposit = parsedEvent.args.minDeposit.toString()
        await activePluginSetting.save()

        logger.verbose('minDepositSet VeGovernance', llo({ info }))
      }),
    )
  },

  minLockSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.exitQueueAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.error('Plugin not found for minLockSet event', llo({ info }))
      return
    }

    await Promise.all(
      plugins.map(async (plugin: any) => {
        const activePluginSetting = await Models.Setting.findActive({
          network: info.network,
          pluginAddress: plugin.address,
        })

        if (!activePluginSetting) {
          logger.error(
            'Active plugin setting not found for minLockSet event',
            llo({
              info,
              pluginAddress: plugin.address,
            }),
          )
          return
        }

        activePluginSetting.votingEscrow.minLockTime = Number(parsedEvent.args.minLock)
        await activePluginSetting.save()

        logger.verbose('minLockSet VeGovernance', llo({ info }))
      }),
    )
  },
}
