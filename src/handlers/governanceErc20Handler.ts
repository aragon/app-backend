import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, IEventLogMember, type ILogInfo, IMetricAction, ITransferSide, ITransferType } from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import type Plugin from '@models/schema/plugin'
import { RabbitMQHelper } from '@helpers/redditMQ'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:GovernanceErc20Handler' })

export const GovernanceErc20Handler = {
  // is trigger once for all user - (from user increase balance and 1 user decrease balance)
  transfer: async (parsedEvent: LogDescription, info: ILogInfo, isHistorical?: boolean) => {
    // when realtime the plugin is undefined, check if related to aragon dao
    const plugin = await Models.Plugin.findByTokenAddress(info.address, info.network)
    if (!plugin) return

    // outgoing transfer for 'from' user
    if (parsedEvent.args.from !== utils.zeroAddress) {
      await GovernanceErc20Handler._outgoingTransfer(parsedEvent, info, plugin, isHistorical)
    }

    // incoming transfer for 'to' user
    if (parsedEvent.args.to !== utils.zeroAddress) {
      await GovernanceErc20Handler._incomingTransfer(parsedEvent, info, plugin, isHistorical)
    }
  },

  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // when realtime the plugin is undefined, check if related to aragon dao
    const plugin = await Models.Plugin.findByTokenAddress(info.address, info.network)
    if (!plugin) return

    if (parsedEvent.args.delegate === utils.zeroAddress) {
      return
    }

    try {
      const member = await ProxyMember.createMember(parsedEvent.args.delegate)
      const side =
        parsedEvent.args.previousBalance < parsedEvent.args.newBalance ? ITransferSide.incoming : ITransferSide.outgoing

      const existingLog = await Models.MemberTransaction.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        address: member.address,
      })

      if (existingLog) {
        logger.error('DelegateVotesChanged - already processed', llo({ info }))
        return
      }

      let tokenBalance = await ProxyMember.getBalances({
        address: parsedEvent.args.delegate,
        tokenAddress: info.address,
        network: info.network,
      })

      const newVotingPower = BigInt(parsedEvent.args.newBalance || 0)

      tokenBalance = await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await tokenBalance.updateVotingPower(newVotingPower.toString(), info.blockNumber, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update Token votingPower', llo({ logId: logDb.id }))
        return logDb
      })

      const { from, to } = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      const memberBalance = await Web3Helper.getTokenBalanceAtBlock({
        address: member.address,
        tokenAddress: info.address,
        blockNumber: info.blockNumber,
        network: info.network,
      })

      // we always check if member receive or send the delegation to add and remove from the dao
      if (newVotingPower > 0n) {
        // add to dao
        await ProxyMember.addToDao({
          memberAddress: member?.address,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        })
      } else {
        if (BigInt(memberBalance) === 0n && newVotingPower === 0n) {
          // member not part of the dao anymore
          await ProxyMember.removeFromDao({
            memberAddress: member?.address,
            daoAddress: plugin.daoAddress,
            pluginAddress: plugin.address,
            network: info.network,
          })
        }
      }

      if (from === utils.zeroAddress || to === utils.zeroAddress) {
        // Note we skip all delegation happened on transfer, mint, burn, etc
        return
      }

      // only if a member have delegate we store the delegate transaction
      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.MemberTransaction.create(
          {
            network: info.network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
            blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
            address: member.address,
            type: ITransferType.delegate,
            side,
            from,
            to,
            amount: BigInt(parsedEvent.args.value || 0).toString(),
            tokenAddress: info.address,
            memberBalance,
            memberVotingPower: newVotingPower.toString(),
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()

        logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
        return logDb
      })

      if (side === ITransferSide.incoming && to === member.address) {
        await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateReceivedCount, {
          memberAddress: member.address,
          pluginAddress: plugin.address,
          network: info.network,
        })

        await ProxyMember.updateActivity({
          memberAddress: member.address,
          pluginAddress: plugin.address,
          network: info.network,
          blockNumber: info.blockNumber,
        })
      } else if (side === ITransferSide.outgoing && from === member.address) {
        await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateSentCount, {
          memberAddress: member.address,
          pluginAddress: plugin.address,
          network: info.network,
        })

        await ProxyMember.updateActivity({
          memberAddress: member.address,
          pluginAddress: plugin.address,
          network: info.network,
          blockNumber: info.blockNumber,
        })
      }

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: plugin.daoAddress,
        params: { address: plugin.daoAddress, network: plugin.network },
      })
    } catch (error) {
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
    }
  },

  _outgoingTransfer: async (parsedEvent: LogDescription, info: ILogInfo, plugin: Plugin, isHistorical?: boolean) => {
    const memberAddress = parsedEvent.args.from
    await ProxyMember.createMember(parsedEvent.args.from)

    const existingLog = await Models.MemberTransaction.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      address: memberAddress,
    })

    if (existingLog) {
      logger.error('Transfer - outgoing transfer already processed', llo({ info }))
      return
    }

    let tokenBalance = await ProxyMember.getBalances({
      address: memberAddress,
      tokenAddress: info.address,
      network: info.network,
    })

    tokenBalance = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await tokenBalance.decreaseBalance(
        BigInt(parsedEvent.args.value || 0).toString(),
        info.blockNumber,
        { session },
      )
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Transfer outgoing - decreaseBalance', llo({ logId: logDb?.id, info }))
      return logDb
    })

    const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      if (!isHistorical) {
        // wait next block
        await utils.wait(config.NODES[utils.networkToAragon(info.network)].INTERVAL_BLOCK_TIME * 1000 * 2)
      }

      const memberVotingPower = await GovernanceErc20Helper.getPastVotes(
        memberAddress,
        info.address,
        info.blockNumber,
        blockTimestamp,
        info.network,
      )
      const logDb = await Models.MemberTransaction.create(
        {
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp,
          address: memberAddress,
          type: ITransferType.tokenTransfer,
          side: ITransferSide.outgoing,
          from: parsedEvent.args.from,
          to: parsedEvent.args.to,
          amount: BigInt(parsedEvent.args.value).toString(),
          tokenAddress: info.address,
          memberBalance: tokenBalance.amount,
          memberVotingPower: memberVotingPower?.toString() ?? '0',
        },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
      return logDb
    })

    if (BigInt(memberTransaction.memberBalance) === 0n && BigInt(memberTransaction.memberVotingPower) === 0n) {
      await ProxyMember.removeFromDao({
        memberAddress,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: info.network,
      })
    }

    // Dao metrics
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: plugin.daoAddress,
      params: { address: plugin.daoAddress, network: plugin.network },
    })
  },

  _incomingTransfer: async (parsedEvent: LogDescription, info: ILogInfo, plugin: Plugin, isHistorical?: boolean) => {
    const memberAddress = parsedEvent.args.to
    await ProxyMember.createMember(parsedEvent.args.to)

    const existingLog = await Models.MemberTransaction.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      address: memberAddress,
    })

    if (existingLog) {
      logger.error('Transfer - incoming transfer already processed', llo({ info }))
      return
    }

    let tokenBalance = await ProxyMember.getBalances({
      address: memberAddress,
      tokenAddress: info.address,
      network: info.network,
    })

    tokenBalance = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await tokenBalance.increaseBalance(
        BigInt(parsedEvent.args.value || 0).toString(),
        info.blockNumber,
        { session },
      )
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Transfer incoming - increaseBalance', llo({ logId: logDb?.id, info }))
      return logDb
    })

    await DbTx.executeTxFn(async ({ session }) => {
      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      if (!isHistorical) {
        // wait next block
        await utils.wait(config.NODES[utils.networkToAragon(info.network)].INTERVAL_BLOCK_TIME * 1000 * 2)
      }

      const memberVotingPower = await GovernanceErc20Helper.getPastVotes(
        memberAddress,
        info.address,
        info.blockNumber,
        blockTimestamp,
        info.network,
      )

      const logDb = await Models.MemberTransaction.create(
        {
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp,
          address: memberAddress,
          side: ITransferSide.incoming,
          type: ITransferType.tokenTransfer,
          from: parsedEvent.args.from,
          to: parsedEvent.args.to,
          amount: BigInt(parsedEvent.args.value).toString(),
          tokenAddress: info.address,
          memberBalance: tokenBalance.amount,
          memberVotingPower: memberVotingPower?.toString() ?? '0',
        },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Transfer incoming - tokenTransfer', llo({ logId: logDb?.id, info }))
      return logDb
    })

    await ProxyMember.addToDao({
      memberAddress,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      network: info.network,
    })

    // Dao metrics
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: plugin.daoAddress,
      params: { address: plugin.daoAddress, network: plugin.network },
    })
  },

  _findDelegatorsFromReceipt: async (parsedEvent: LogDescription, info: ILogInfo) => {
    let from = utils.zeroAddress
    let to = utils.zeroAddress

    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)

    if (txReceipt) {
      const delegationChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      const log = delegationChangedLogs?.find(
        ({ parsed }: { parsed: LogDescription | null }) => parsed?.args?.delegator === parsedEvent.args?.delegate,
      )

      if (log?.parsed?.args?.fromDelegate) {
        from = log.parsed.args.fromDelegate
      }

      if (log?.parsed?.args?.toDelegate) {
        to = log.parsed.args.toDelegate
      }
    }

    return { from, to }
  },
}
