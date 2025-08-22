import logger from '@logger'
import { type LogDescription } from 'ethers'
import { type ILogInfo, IPluginInterfaceType, ITokenType } from '@types'
import { Models } from '@dbModels'
import { MemberGovernanceFactory, VeGovernance } from '@src/governance'
import type Plugin from '@models/schema/plugin'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceVeHandler' })

export const GovernanceVeHandler = {
  delegateTokens: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      tokenAddress: info.address,
      network: info.network,
    })

    if (!plugins || plugins.length === 0) return

    const fromAddress = parsedEvent.args.sender
    const toAddress = parsedEvent.args.delegatee
    const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

    try {
      const isSelfDelegation = fromAddress === toAddress

      // Create base members
      await MemberGovernanceFactory.createBaseMember(fromAddress, info.blockNumber)
      if (!isSelfDelegation) {
        await MemberGovernanceFactory.createBaseMember(toAddress, info.blockNumber)
      }

      // Create a VE governance instance for delegation updates
      const governance = MemberGovernanceFactory.create({
        address: plugins[0].votingEscrow.escrowAddress,
        network: info.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenType: ITokenType.escrowAdapter,
        extraParams: {
          escrowAdapterAddress: info.address,
        },
      })

      await governance.update(toAddress, {
        tokenIds,
        delegateReceiverAddress: toAddress,
      })

      // Update plugin metrics
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const governance = MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: info.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
          })

          await governance.updatePluginMetrics({
            memberAddress: fromAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })

          if (!isSelfDelegation) {
            await governance.updatePluginMetrics({
              memberAddress: toAddress,
              pluginAddress: plugin.address,
              daoAddress: plugin.daoAddress,
              network: info.network,
              lastActivity: info.blockNumber,
            })
          }
        }),
      )

      await governance.updateDaoMetrics()

      logger.verbose('Delegate tokens VeGovernance', llo({ info, fromAddress, toAddress, tokenIds }))
    } catch (error) {
      logger.error('DelegateTokens error', llo({ error, info, fromAddress, toAddress }))
    }
  },

  unDelegateTokens: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      tokenAddress: info.address,
      network: info.network,
    })
    if (!plugins || plugins.length === 0) return

    const fromAddress = parsedEvent.args.sender
    const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

    try {
      await MemberGovernanceFactory.createBaseMember(fromAddress, info.blockNumber)

      const governance = MemberGovernanceFactory.create({
        address: plugins[0].votingEscrow.escrowAddress,
        network: info.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenType: ITokenType.escrowAdapter,
        extraParams: {
          escrowAdapterAddress: info.address,
        },
      })

      await governance.update(fromAddress, {
        tokenIds,
        delegateReceiverAddress: null,
      })

      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const governance = MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: info.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
          })

          await governance.updatePluginMetrics({
            memberAddress: fromAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      await governance.updateDaoMetrics()

      logger.verbose('Undelegate tokens VeGovernance', llo({ info, fromAddress, tokenIds }))
    } catch (error) {
      logger.error('UnDelegateTokens error', llo({ error, info, fromAddress }))
    }
  },

  deposit: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for deposit event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.depositor

    await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

    const governance = MemberGovernanceFactory.create({
      address: info.address,
      network: info.network,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenType: ITokenType.escrowAdapter,
    })

    await governance.getOrCreate(memberAddress, { parsedEvent, info })

    await Promise.all(
      plugins.map(async (plugin: Plugin) => {
        await governance.updatePluginMetrics({
          memberAddress,
          pluginAddress: plugin.address,
          daoAddress: plugin.daoAddress,
          network: info.network,
          lastActivity: info.blockNumber,
        })
      }),
    )

    logger.verbose('Deposit VeGovernance - Lock created', llo({ info, memberAddress }))
  },

  withdraw: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for withdraw event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.depositor

    try {
      await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

      const veGovernance = new VeGovernance(info.address, info.network)

      await veGovernance.lockWithdrawn(memberAddress, {
        parsedEvent,
        info,
        lastActivity: info.blockNumber,
      })

      // Update plugin metrics for all plugins
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const pluginGovernance = MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: info.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
          })

          await pluginGovernance.updatePluginMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      logger.verbose(
        'Withdraw VeGovernance',
        llo({ info, memberAddress, tokenId: parsedEvent.args.tokenId.toString() }),
      )
    } catch (error) {
      logger.error('Withdraw error', llo({ error, info, memberAddress }))
    }
  },

  exitQueued: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.exitQueueAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for exitQueued event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.holder
    const tokenId = parsedEvent.args.tokenId.toString()

    try {
      // Create a base member using MemberGovernanceFactory
      await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)
      // Create a VE governance instance using the exitQueueAddress from the first plugin
      const veGovernance = new VeGovernance(plugins[0].tokenAddress, info.network)

      // Process exit queued through VeGovernance
      await veGovernance.exitQueued(memberAddress, {
        parsedEvent,
        info,
        lastActivity: info.blockNumber,
      })

      // Update plugin metrics for all plugins
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const pluginGovernance = MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: info.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
          })

          await pluginGovernance.updatePluginMetrics({
            memberAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      logger.verbose('Exit queued VeGovernance', llo({ info, memberAddress, tokenId }))
    } catch (error) {
      logger.error('ExitQueued error', llo({ error, info, memberAddress }))
    }
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
}
