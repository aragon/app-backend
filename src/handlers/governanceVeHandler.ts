import { Models } from '@dbModels'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type MemberLock from '@models/schema/lock'
import { MemberGovernanceFactory, VeGovernance } from '@src/governance'
import { type ILogInfo, IPluginInterfaceType, ITokenType, IVotingEscrowAdapterLogs } from '@types'
import { Interface, type LogDescription } from 'ethers'
import GovernanceVeHelper from '@helpers/governanceVe'
import { VotingEscrow } from '@artifacts/VotingEscrow'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceVeHandler' })

export const GovernanceVeHandler = {
  delegateTokens: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      tokenAddress: info.address,
      network: info.network,
      interfaceType: { $in: [IPluginInterfaceType.tokenVoting, IPluginInterfaceType.gauge] },
    })

    if (!plugins || plugins.length === 0) return

    const fromAddress = parsedEvent.args.sender
    const toAddress = parsedEvent.args.delegatee
    const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

    try {
      const existingDelegateLog = await Models.TokenDelegation.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      })
      if (!existingDelegateLog) {
        await Models.TokenDelegation.createLog({
          network: info.network,
          contractAddress: info.address,
          delegator: fromAddress,
          delegate: toAddress,
          tokenIds,
          action: 'delegate',
          blockNumber: info.blockNumber,
          blockTimestamp: await info.context!.getBlockTimestamp(info.blockNumber),
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
        })
      }

      const isSelfDelegation = fromAddress === toAddress

      await MemberGovernanceFactory.createBaseMember(fromAddress, info.blockNumber)
      if (!isSelfDelegation) {
        await MemberGovernanceFactory.createBaseMember(toAddress, info.blockNumber)
      }

      const escrowAddress = await GovernanceVeHelper.getEscrowAddress(info.address, info.network)
      if (escrowAddress) {
        const governance = MemberGovernanceFactory.create({
          address: escrowAddress,
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

        await governance.updateDaoMetrics()
      }

      // Update plugin metrics
      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const governance = MemberGovernanceFactory.createFromPlugin(plugin)

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

      logger.verbose('Delegate tokens VeGovernance', llo({ info, fromAddress, toAddress, tokenIds }))
    } catch (error) {
      logger.error('DelegateTokens error', llo({ error, info, fromAddress, toAddress }))
    }
  },

  unDelegateTokens: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      tokenAddress: info.address,
      network: info.network,
      interfaceType: { $in: [IPluginInterfaceType.tokenVoting, IPluginInterfaceType.gauge] },
    })
    if (!plugins || plugins.length === 0) return

    const fromAddress = parsedEvent.args.sender
    const tokenIds = parsedEvent.args.tokenIds.map((id: any) => id.toString())

    try {
      const existingUndelegateLog = await Models.TokenDelegation.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
      })
      if (!existingUndelegateLog) {
        await Models.TokenDelegation.createLog({
          network: info.network,
          contractAddress: info.address,
          delegator: fromAddress,
          delegate: parsedEvent.args.delegatee,
          tokenIds,
          action: 'undelegate',
          blockNumber: info.blockNumber,
          blockTimestamp: await info.context!.getBlockTimestamp(info.blockNumber),
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
        })
      }

      await MemberGovernanceFactory.createBaseMember(fromAddress, info.blockNumber)

      const escrowAddress = await GovernanceVeHelper.getEscrowAddress(info.address, info.network)
      if (escrowAddress) {
        const governance = MemberGovernanceFactory.create({
          address: escrowAddress,
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

        await governance.updateDaoMetrics()
      }

      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const governance = MemberGovernanceFactory.createFromPlugin(plugin)

          await governance.updatePluginMetrics({
            memberAddress: fromAddress,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })
        }),
      )

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
      extraParams: {
        escrowAdapterAddress: plugins[0].tokenAddress,
      },
    })

    const lockMember = await governance.getOrCreate(memberAddress, { parsedEvent, info })
    const ifDelegationExist = await GovernanceVeHandler.checkSameTxDelegation(lockMember, info)

    if (ifDelegationExist && lockMember) {
      await governance.update(ifDelegationExist, {
        tokenIds: [lockMember.tokenId],
        delegateReceiverAddress: ifDelegationExist,
      })
    }

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
      logger.warn('Plugin not found for minDepositSet event', llo({ info }))
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
      logger.warn('Plugin not found for minLockSet event', llo({ info }))
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

  split: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for split event', llo({ info }))
      return
    }

    const fromTokenId = parsedEvent.args._from.toString()
    const newTokenId = parsedEvent.args.newTokenId.toString()
    const sender = parsedEvent.args._sender
    const splitAmount1 = parsedEvent.args._splitAmount1.toString()
    const splitAmount2 = parsedEvent.args._splitAmount2.toString()

    try {
      await MemberGovernanceFactory.createBaseMember(sender, info.blockNumber)

      const veGovernance = new VeGovernance(info.address, info.network)

      await veGovernance.lockSplit({
        fromTokenId,
        newTokenId,
        splitAmount1,
        splitAmount2,
        info,
      })

      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const pluginGovernance = MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: info.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
          })

          await pluginGovernance.updatePluginMetrics({
            memberAddress: sender,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      logger.verbose('Split VeGovernance', llo({ info, fromTokenId, newTokenId, sender, splitAmount1, splitAmount2 }))
    } catch (error) {
      logger.error('Split error', llo({ error, info, fromTokenId, newTokenId }))
    }
  },

  exitCancelled: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.exitQueueAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for exitCancelled event', llo({ info }))
      return
    }

    const memberAddress = parsedEvent.args.holder
    const tokenId = parsedEvent.args.tokenId.toString()

    try {
      await MemberGovernanceFactory.createBaseMember(memberAddress, info.blockNumber)

      const veGovernance = new VeGovernance(plugins[0].tokenAddress, info.network)

      await veGovernance.exitCancelled(memberAddress, {
        parsedEvent,
        info,
        lastActivity: info.blockNumber,
      })

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

      logger.verbose('Exit cancelled VeGovernance', llo({ info, memberAddress, tokenId }))
    } catch (error) {
      logger.error('ExitCancelled error', llo({ error, info, memberAddress }))
    }
  },

  merge: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.find({
      'votingEscrow.escrowAddress': info.address,
      network: info.network,
    })

    if (plugins.length === 0) {
      logger.warn('Plugin not found for merge event', llo({ info }))
      return
    }

    const sender = parsedEvent.args._sender
    const fromTokenId = parsedEvent.args._from.toString()
    const toTokenId = parsedEvent.args._to.toString()
    const newTotalAmount = parsedEvent.args._newTotalAmount.toString()

    try {
      await MemberGovernanceFactory.createBaseMember(sender, info.blockNumber)

      const veGovernance = new VeGovernance(info.address, info.network)

      await veGovernance.lockMerge({
        fromTokenId,
        toTokenId,
        newTotalAmount,
        info,
      })

      await Promise.all(
        plugins.map(async (plugin: Plugin) => {
          const pluginGovernance = MemberGovernanceFactory.create({
            address: plugin.tokenAddress,
            network: info.network,
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenType: ITokenType.escrowAdapter,
          })

          await pluginGovernance.updatePluginMetrics({
            memberAddress: sender,
            pluginAddress: plugin.address,
            daoAddress: plugin.daoAddress,
            network: info.network,
            lastActivity: info.blockNumber,
          })
        }),
      )

      logger.verbose('Merge VeGovernance', llo({ info, fromTokenId, toTokenId, sender, newTotalAmount }))
    } catch (error) {
      logger.error('Merge error', llo({ error, info, fromTokenId, toTokenId }))
    }
  },

  checkSameTxDelegation: async (lockMember: MemberLock, info: ILogInfo) => {
    const txLogs = await info.context!.getLogsByTxHash(info.transactionHash)
    if (!txLogs.length) return

    const iface = new Interface(VotingEscrow.abi)
    for (const log of txLogs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data })
        if (parsed?.name !== IVotingEscrowAdapterLogs.TokensDelegated) continue

        const tokenIds = parsed.args.tokenIds.map((id: any) => id.toString())
        if (!tokenIds.includes(lockMember.tokenId)) continue

        return parsed.args.delegatee
      } catch (_) {}
    }
  },
}
