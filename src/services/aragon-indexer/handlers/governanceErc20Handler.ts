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

const llo = logger.logMeta.bind(null, { service: 'service:indexer:GovernanceErc20Handler' })

export const GovernanceErc20Handler = {
  // is trigger once for all user - (from user increase balance and 1 user decrease balance)
  transfer: async (parsedEvent: LogDescription, info: ILogInfo, plugin?: Plugin) => {
    // outgoing transfer
    if (parsedEvent.args.from !== utils.zeroAddress) {
      await GovernanceErc20Handler._outgoingTransfer(parsedEvent, info, plugin)
    }

    // incoming transfer
    if (parsedEvent.args.to !== utils.zeroAddress) {
      await GovernanceErc20Handler._incomingTransfer(parsedEvent, info, plugin)
    }
  },

  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo, plugin?: Plugin) => {
    if (parsedEvent.args.delegate === utils.zeroAddress) {
      return
    }

    const member = await ProxyMember.saveAndGetMember(parsedEvent.args.delegate)
    const side =
      parsedEvent.args.previousBalance < parsedEvent.args.newBalance ? ITransferSide.incoming : ITransferSide.outgoing

    const existingLog = await Models.MemberTransaction.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })

    if (existingLog) return

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

    const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.MemberTransaction.create(
        {
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
          address: member?.address,
          type: ITransferType.delegate,
          side,
          from,
          to,
          amount: BigInt(parsedEvent.args.value || 0).toString(),
          tokenAddress: info.address,
          memberBalance: await Web3Helper.getTokenBalanceAtBlock({
            address: member?.address,
            tokenAddress: info.address,
            blockNumber: info.blockNumber,
            network: info.network,
          }),
          memberVotingPower: newVotingPower.toString(),
        },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
      return logDb
    })

    if (!plugin) {
      plugin = await Models.Plugin.findActivePluginByTokenAddress(info.address, info.network)
    }

    if (!plugin) {
      logger.error('Plugin not found - delegateVoteChanged member metrics not updated', llo({ info }))
      return
    }

    if (side === ITransferSide.incoming) {
      await ProxyMember.updateMemberMetrics(IMetricAction.increaseDelegateReceivedCount, {
        memberAddress: member.address,
        pluginAddress: plugin.address,
        network: info.network,
      })
    } else {
      await ProxyMember.updateMemberMetrics(IMetricAction.increaseDelegateSentCount, {
        memberAddress: member.address,
        pluginAddress: plugin.address,
        network: info.network,
      })
    }

    if (newVotingPower > 0n) {
      // add to dao
      await ProxyMember.addToDao({
        memberAddress: member?.address,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: info.network,
      })
    } else {
      if (BigInt(memberTransaction.memberBalance) === 0n && newVotingPower === 0n) {
        // member not part of the dao anymore
        await ProxyMember.removeFromDao({
          memberAddress: member?.address,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        })
      }
    }

    // Dao metrics
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: plugin.daoAddress,
      params: { address: plugin.daoAddress, network: plugin.network },
    })
  },

  _outgoingTransfer: async (parsedEvent: LogDescription, info: ILogInfo, plugin?: Plugin) => {
    const memberAddress = parsedEvent.args.from
    await ProxyMember.saveAndGetMember(parsedEvent.args.from)

    const existingLog = await Models.MemberTransaction.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })

    if (existingLog) {
      logger.error('DelegateVotesChanged - outgoing transfer already processed', llo({ info }))
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
      const logDb = await Models.MemberTransaction.create(
        {
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
          address: memberAddress,
          type: ITransferType.tokenTransfer,
          side: ITransferSide.outgoing,
          from: parsedEvent.args.from,
          to: parsedEvent.args.to,
          amount: BigInt(parsedEvent.args.value).toString(),
          tokenAddress: info.address,
          memberBalance: tokenBalance.amount,
          memberVotingPower: await GovernanceErc20Helper.getPastVotes(
            memberAddress,
            info.address,
            info.blockNumber,
            info.network,
          ),
        },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
      return logDb
    })

    if (!plugin) {
      plugin = await Models.Plugin.findActivePluginByTokenAddress(info.address, info.network)
    }

    if (!plugin) {
      logger.error('Plugin not found - incoming member metrics not updated', llo({ info }))
      return
    }

    if (BigInt(memberTransaction.memberBalance) === 0n && memberTransaction.votingPower === 0n) {
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

  _incomingTransfer: async (parsedEvent: LogDescription, info: ILogInfo, plugin?: Plugin) => {
    const memberAddress = parsedEvent.args.to
    await ProxyMember.saveAndGetMember(parsedEvent.args.to)

    const existingLog = await Models.MemberTransaction.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })

    if (existingLog) {
      logger.error('DelegateVotesChanged - incoming transfer already processed', llo({ info }))
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
      const logDb = await Models.MemberTransaction.create(
        {
          network: info.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
          address: memberAddress,
          side: ITransferSide.incoming,
          type: ITransferType.tokenTransfer,
          from: parsedEvent.args.from,
          to: parsedEvent.args.to,
          amount: BigInt(parsedEvent.args.value).toString(),
          tokenAddress: info.address,
          memberBalance: tokenBalance.amount,
          memberVotingPower: await GovernanceErc20Helper.getPastVotes(
            memberAddress,
            info.address,
            info.blockNumber,
            info.network,
          ),
        },
        { session },
      )
      await session.commitTransaction()
      await session.endSession()

      logger.verbose('Transfer incoming - tokenTransfer', llo({ logId: logDb?.id, info }))
      return logDb
    })

    if (!plugin) {
      plugin = await Models.Plugin.findActivePluginByTokenAddress(info.address, info.network)
    }

    if (!plugin) {
      logger.error('Plugin not found - incoming member metrics not updated', llo({ info }))
      return
    }

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
      const delegationVotesChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      const log = delegationVotesChangedLogs?.find(
        ({ parsed }: { parsed: any }) => parsed.args?.delegator === parsedEvent.args?.delegate,
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
