import logger from '@logger'
import { type LogDescription } from 'ethers'
import { type ILogInfo, IPluginInterfaceType, ITokenType } from '@types'
import { Models } from '@dbModels'
import { MemberGovernanceFactory } from '@modules/memberGovernance'
import Web3Helper from '@helpers/web3'
import { EnumQueueName, ITransferSide } from '@types'
import utils from '@helpers/utils'
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

      if (fromAddress === toAddress) {
        logger.verbose(
          'Self-delegation detected, skipping incoming delegation handling',
          llo({ info, fromAddress, toAddress }),
        )
        return
      }

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

      if (fromAddress === toAddress) {
        logger.verbose('Self-delegation detected, skipping delegation handling', llo({ info, fromAddress, toAddress }))
        return
      }

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
    const tokenId = Number(parsedEvent.args.tokenId.toString())
    const tokenIdStr = parsedEvent.args.tokenId.toString()
    const amount = parsedEvent.args.value.toString()
    const epochStartAt = Number(parsedEvent.args.startTs)
    const totalLocked = parsedEvent.args.newTotalLocked.toString()

    const lockParams = {
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      tokenAddress: plugins[0].tokenAddress,
      memberAddress,
      tokenId: tokenIdStr,
      escrowAddress,
    }

    const existingLock = await Models.Lock.findExistingLog(lockParams)
    if (existingLock) {
      logger.warn(
        'Deposit VeGovernance - Lock already exists',
        llo({ info, memberAddress, tokenId, escrow: escrowAddress }),
      )
      return
    }

    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined

    // Create base member using MemberGovernanceFactory
    await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

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
      tokenId: tokenIdStr,
      amount,
      epochStartAt,
      totalLocked,
      exitQueueAddress,
    })

    logger.verbose('Deposit VeGovernance - Lock created', llo({ info, memberAddress, tokenId, escrow: escrowAddress }))

    // Create VE governance instance for token operations
    const governance = MemberGovernanceFactory.create({
      address: tokenAddress,
      network: info.network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenType: ITokenType.escrowAdapter,
    })

    // Get or create token member and update tokenIds
    await governance.getOrCreate(memberAddress)
    const tokenMember = await governance.findOne(memberAddress)
    const currentTokenIds = tokenMember?.tokenIds || []

    if (!currentTokenIds.includes(tokenIdStr)) {
      currentTokenIds.push(tokenIdStr)
      await governance.update(memberAddress, {
        tokenIds: currentTokenIds,
        lastActivity: info.blockNumber,
      })
    }

    // Update plugin metrics for all plugins
    await Promise.all(
      plugins.map(async (plugin: Plugin) => {
        await governance.getOrCreatePluginMetrics({
          memberAddress,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: info.network,
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

    logger.verbose('Deposit VeGovernance - Member and voting power updated', llo({ info, memberAddress, tokenId }))
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
    const tokenId = Number(parsedEvent.args.tokenId.toString())
    const tokenIdStr = parsedEvent.args.tokenId.toString()
    const amount = parsedEvent.args.value.toString()
    const epochEndAt = Number(parsedEvent.args.ts)
    const totalLocked = parsedEvent.args.newTotalLocked.toString()

    const memberLockParams = {
      escrowAddress,
      network: info.network,
      memberAddress,
      tokenId: tokenIdStr,
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

    if (existingLock.lockWithdraw?.status) return

    const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined

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

    // Create base member using MemberGovernanceFactory
    await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

    // Create VE governance instance for token operations
    const governance = MemberGovernanceFactory.create({
      address: plugins[0].tokenAddress, // Use tokenAddress from plugin
      network: info.network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenType: ITokenType.escrowAdapter,
    })

    // Get token member and update tokenIds
    const tokenMember = await governance.findOne(memberAddress)
    const currentTokenIds = tokenMember?.tokenIds || []
    const tokenIdsToSave = currentTokenIds.filter(id => id !== tokenIdStr)

    await governance.update(memberAddress, {
      votingPower: tokenIdsToSave.length > 0 ? undefined : '0',
      tokenIds: tokenIdsToSave,
      lastActivity: info.blockNumber,
    })

    // Update plugin metrics for all plugins
    await Promise.all(
      plugins.map(async (plugin: Plugin) => {
        await governance.getOrCreatePluginMetrics({
          memberAddress,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: info.network,
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

    logger.verbose('Withdraw VeGovernance', llo({ info, memberAddress, tokenId }))
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

    if (memberLock.lockExit?.status) return

    await memberLock.update({
      lockExit: {
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp,
        exitDateAt,
      },
    })

    // Create base member using MemberGovernanceFactory
    await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

    // Create VE governance instance for plugin metrics
    const governance = MemberGovernanceFactory.create({
      address: plugins[0].tokenAddress, // Use tokenAddress from plugin
      network: info.network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenType: ITokenType.escrowAdapter,
    })

    // Update plugin metrics for all plugins
    await Promise.all(
      plugins.map(async (plugin: Plugin) => {
        await governance.getOrCreatePluginMetrics({
          memberAddress,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: info.network,
          lastActivity: info.blockNumber,
        })
      }),
    )

    logger.verbose('Exit queued VeGovernance', llo({ info, memberAddress, tokenId }))
  },

  minDepositSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const minDeposit = parsedEvent.args.minDeposit.toString()
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

        if (!activePluginSetting.votingEscrow) {
          activePluginSetting.votingEscrow = {}
        }

        if (activePluginSetting.votingEscrow.minDeposit === minDeposit) return

        activePluginSetting.votingEscrow.minDeposit = minDeposit
        await activePluginSetting.save()

        logger.verbose('minDepositSet VeGovernance', llo({ info }))
      }),
    )
  },

  minLockSet: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const minLock = Number(parsedEvent.args.minLock)
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

        if (!activePluginSetting.votingEscrow) {
          activePluginSetting.votingEscrow = {}
        }

        if (activePluginSetting?.votingEscrow?.minLockTime === minLock) return

        activePluginSetting.votingEscrow.minLockTime = minLock
        await activePluginSetting.save()

        logger.verbose('minLockSet VeGovernance', llo({ info }))
      }),
    )
  },

  _handleTokenDelegation: async (
    parsedEvent: LogDescription,
    info: ILogInfo,
    memberAddress: string,
    transferSide: ITransferSide,
    plugins: Plugin[],
    tokenIds: string[],
  ) => {
    try {
      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTokenDelegation token not found', llo({ info }))
        return
      }

      let lastActivity: undefined | number
      if (transferSide === ITransferSide.outgoing) {
        lastActivity = info.blockNumber
      }

      // Create base member using MemberGovernanceFactory
      await MemberGovernanceFactory.createBaseMember(memberAddress, lastActivity)

      // Create VE governance instance for token operations
      const governance = MemberGovernanceFactory.create({
        address: info.address, // token address
        network: info.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenType: ITokenType.escrowAdapter,
      })

      // Get or create token member
      await governance.getOrCreate(memberAddress)
      const tokenMember = await governance.findOne(memberAddress)

      if (tokenMember && tokenMember?.lastVPBlockNumber > info.blockNumber) return

      const currentTokenIds = tokenMember?.tokenIds || []
      let tokenIdsToSave: string[]

      const isSelfDelegation = parsedEvent.args.sender === parsedEvent.args.delegatee

      if (isSelfDelegation) {
        tokenIdsToSave = [...new Set([...currentTokenIds, ...tokenIds])]
      } else {
        if (transferSide === ITransferSide.incoming) {
          tokenIdsToSave = [...currentTokenIds, ...tokenIds]
        } else {
          tokenIdsToSave = currentTokenIds.filter((id: string) => !tokenIds.includes(id))
        }
      }

      // TODO on l2 the we need to adjust the blockNumber and it should use as offset +1
      const blockTimestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
      const votingPower = await GovernanceErc20Helper.getPastVotes(
        memberAddress,
        info.address,
        info.blockNumber,
        blockTimestamp || 0,
        info.network,
        token.clockMode,
      )

      await governance.update(memberAddress, {
        votingPower: votingPower.toString(),
        tokenIds: tokenIdsToSave,
        lastActivity: info.blockNumber,
      })

      // only when outgoing delegation, we update the delegation metrics
      // update lastActivity metrics for all plugins
      if (lastActivity) {
        const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
        await Promise.all(
          plugins.map(async (plugin: Plugin) => {
            await governance.getOrCreatePluginMetrics({
              memberAddress,
              pluginAddress: plugin.address,
              daoAddress: plugin.daoAddress,
              network: info.network,
              lastActivity,
            })
          }),
        )
      }

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
      logger.error('Error handling token delegation', llo({ error, info, memberAddress, transferSide, tokenIds }))
    }
  },
}
