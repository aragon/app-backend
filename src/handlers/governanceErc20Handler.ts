import logger from '@logger'
import { type LogDescription } from 'ethers'
import {
  EnumQueueName,
  IEventLogMember,
  type ILogInfo,
  IMetricAction,
  ITokenType,
  ITransferSide,
  ITransferType,
} from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import type Plugin from '@models/schema/plugin'
import { RabbitMQHelper } from '@helpers/radditMQ'
import config from '@config'
import { ProxyToken } from '@modules/proxyToken'

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

    if (!parsedEvent.args.delegate || parsedEvent.args.delegate === utils.zeroAddress) {
      return
    }

    const memberAddress = parsedEvent.args.delegate
    await ProxyMember.createMember(memberAddress)

    const tokenBalance = await ProxyMember.getBalances({
      address: memberAddress,
      tokenAddress: info.address,
      network: info.network,
    })

    try {
      const newVotingPower = await DbTx.executeTxFn(async ({ session }) => {
        const existingLog = await Models.MemberTransaction.findExistingLog(
          {
            network: info.network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            address: memberAddress,
          },
          { session },
        )

        if (existingLog) {
          logger.warn('DelegateVotesChanged - already processed', llo({ info }))
          return false
        }

        const newVotingPower = BigInt(parsedEvent?.args?.newBalance || 0)
        await tokenBalance?.updateVotingPower(newVotingPower.toString(), info.blockNumber, { session })
        await session.commitTransaction()
        await session.endSession()
        return newVotingPower
      })
      if (newVotingPower === false) return

      const memberBalance = await Web3Helper.getTokenBalanceAtBlock({
        address: memberAddress,
        tokenAddress: info.address,
        blockNumber: info.blockNumber,
        network: info.network,
      })

      // we always check if member receive or send the delegation to add and remove from the dao
      if (newVotingPower > 0n) {
        // add to dao
        await ProxyMember.addToDao({
          memberAddress,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        })
      } else {
        if (BigInt(memberBalance) === 0n && newVotingPower === 0n) {
          // member not part of the dao anymore
          await ProxyMember.removeFromDao({
            memberAddress,
            daoAddress: plugin.daoAddress,
            pluginAddress: plugin.address,
            network: info.network,
          })
        }
      }

      const { from, to } = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      if (from === utils.zeroAddress || to === utils.zeroAddress) {
        // Note we skip all delegation happened on transfer, mint, burn, etc
        return false
      }

      let side: ITransferSide
      if (memberAddress === from) {
        side = ITransferSide.outgoing
      } else if (memberAddress === to) {
        side = ITransferSide.incoming
      } else {
        // cannot detect side
        logger.error('Error cannot detect delegation side', llo({ from, to, memberAddress, info }))
        return false
      }

      // save member transaction
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
            type: ITransferType.delegate,
            side,
            from,
            to,
            amount: BigInt(parsedEvent?.args?.value || 0).toString(),
            tokenAddress: info.address,
            memberBalance,
            memberVotingPower: newVotingPower.toString(),
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
      })

      if (side === ITransferSide.incoming) {
        await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateReceivedCount, {
          memberAddress,
          pluginAddress: plugin.address,
          network: info.network,
        })
      } else if (side === ITransferSide.outgoing) {
        await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateSentCount, {
          memberAddress,
          pluginAddress: plugin.address,
          network: info.network,
        })
      }

      await ProxyMember.updateActivity({
        memberAddress,
        pluginAddress: plugin.address,
        network: info.network,
        blockNumber: info.blockNumber,
      })

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
    try {
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
        logger.warn('Transfer - outgoing transfer already processed', llo({ info }))
        return false
      }

      if (!isHistorical) {
        // wait 2 blocks
        await utils.wait(config.NODES[utils.networkToAragon(info.network)].INTERVAL_BLOCK_TIME * 1000 * 2)
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)
      const tokenBalanceDb = await ProxyMember.getBalances({
        address: memberAddress,
        tokenAddress: info.address,
        network: info.network,
      })
      const token = await ProxyToken.saveAndGetToken(info.address, info.network)

      let tokenBal: string = '0'
      let memberVotingPower: string = '0'

      if (token?.type === ITokenType.GovernanceERC20) {
        tokenBal = BigInt(parsedEvent?.args?.value || 0)?.toString()
        memberVotingPower = await GovernanceErc20Helper.getPastVotes(
          memberAddress,
          info.address,
          info.blockNumber,
          blockTimestamp,
          info.network,
        )
      } else if (token?.type === ITokenType.ERC721) {
        tokenBal = BigInt(1).toString()
      }

      const tokenId = parsedEvent.args.tokenId !== undefined ? Number(parsedEvent.args.tokenId || 0) : undefined

      // decrease balance
      const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
        await tokenBalanceDb?.decreaseBalance(
          {
            amount: tokenBal,
            blockNumber: info.blockNumber,
            tokenId,
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
            type: ITransferType.tokenTransfer,
            side: ITransferSide.outgoing,
            from: parsedEvent.args.from,
            to: parsedEvent.args.to,
            amount: tokenBal,
            tokenAddress: info.address,
            memberBalance: tokenBalanceDb?.amount,
            memberVotingPower,
            tokenId,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        return memberTransaction
      })

      if (BigInt(memberTransaction.memberBalance) === 0n && BigInt(memberTransaction.memberVotingPower) === 0n) {
        await ProxyMember.removeFromDao({
          memberAddress,
          daoAddress: plugin.daoAddress,
          pluginAddress: plugin.address,
          network: info.network,
        })
      }
      logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: memberTransaction?.id, info }))

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: plugin.daoAddress,
        params: { address: plugin.daoAddress, network: plugin.network },
      })
    } catch (error) {
      logger.error('Transfer - outgoing transfer error', llo({ error, info }))
    }
  },

  _incomingTransfer: async (parsedEvent: LogDescription, info: ILogInfo, plugin: Plugin, isHistorical?: boolean) => {
    try {
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
        logger.warn('Transfer - incoming transfer already processed', llo({ info }))
        return false
      }

      if (!isHistorical) {
        // wait 2 blocks
        await utils.wait(config.NODES[utils.networkToAragon(info.network)].INTERVAL_BLOCK_TIME * 1000 * 2)
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)
      let tokenBalanceDb = await ProxyMember.getBalances({
        address: memberAddress,
        tokenAddress: info.address,
        network: info.network,
      })
      const token = await ProxyToken.saveAndGetToken(info.address, info.network)

      let tokenBal: string = '0'
      let memberVotingPower: string = '0'

      if (token?.type === ITokenType.GovernanceERC20) {
        tokenBal = BigInt(parsedEvent?.args?.value || 0)?.toString()
        memberVotingPower = await GovernanceErc20Helper.getPastVotes(
          memberAddress,
          info.address,
          info.blockNumber,
          blockTimestamp,
          info.network,
        )
      } else if (token?.type === ITokenType.ERC721) {
        tokenBal = BigInt(1).toString()
      }

      const tokenId = parsedEvent.args.tokenId !== undefined ? Number(parsedEvent.args.tokenId || 0) : undefined

      // increase balance
      const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
        tokenBalanceDb = await tokenBalanceDb?.increaseBalance(
          {
            amount: tokenBal,
            blockNumber: info.blockNumber,
            tokenId,
          },
          session,
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
            side: ITransferSide.incoming,
            type: ITransferType.tokenTransfer,
            from: parsedEvent.args.from,
            to: parsedEvent.args.to,
            amount: tokenBal,
            tokenAddress: info.address,
            memberBalance: tokenBalanceDb?.amount,
            memberVotingPower,
            tokenId,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        return memberTransaction
      })

      await ProxyMember.addToDao({
        memberAddress,
        daoAddress: plugin.daoAddress,
        pluginAddress: plugin.address,
        network: info.network,
      })
      logger.verbose('Transfer incoming - MemberTransaction', llo({ logId: memberTransaction?.id, info }))

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: plugin.daoAddress,
        params: { address: plugin.daoAddress, network: plugin.network },
      })
    } catch (error) {
      logger.error('Transfer - incoming transfer error', llo({ error, info }))
    }
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
        ({ parsed }: { parsed: LogDescription | null }) => parsed?.args?.delegator === parsedEvent?.args?.delegate,
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
