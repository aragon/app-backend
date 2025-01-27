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
  type NetworksEnum,
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
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    // outgoing transfer for 'from' user
    if (parsedEvent.args.from !== utils.zeroAddress) {
      await GovernanceErc20Handler._handleTransfer(parsedEvent, info, ITransferSide.outgoing, plugins, isHistorical)
    }

    // incoming transfer for 'to' user
    if (parsedEvent.args.to !== utils.zeroAddress) {
      await GovernanceErc20Handler._handleTransfer(parsedEvent, info, ITransferSide.incoming, plugins, isHistorical)
    }
  },

  async waitForNonHistorical(network: NetworksEnum) {
    await utils.wait(
      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME *
        1000 *
        config.NODES[utils.networkToAragon(network)].CONFIRMATION_BLOCKS,
    )
  },

  _handleTransfer: async (
    parsedEvent: LogDescription,
    info: ILogInfo,
    transferType: ITransferSide,
    plugins: Plugin[],
    isHistorical?: boolean,
  ) => {
    try {
      const memberAddress = transferType === ITransferSide.incoming ? parsedEvent.args.to : parsedEvent.args.from
      await ProxyMember.createMember(memberAddress)

      const existingLog = await Models.MemberTransaction.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        address: memberAddress,
      })

      if (existingLog) {
        logger.warn(`Transfer - ${transferType} transfer already processed`, llo({ info }))
        return
      }

      if (!isHistorical) {
        await GovernanceErc20Handler.waitForNonHistorical(info.network)
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

      const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
        const tokenBalanceFuncName = transferType === ITransferSide.incoming ? 'increaseBalance' : 'decreaseBalance'
        tokenBalanceDb = await tokenBalanceDb?.[tokenBalanceFuncName](
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
            side: transferType,
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

      if (transferType === ITransferSide.incoming) {
        await Promise.all(
          plugins.map(async (plugin: Plugin) => GovernanceErc20Handler._addMemberToDao(memberAddress, plugin)),
        )
      }

      let removeFromDao = false

      if (transferType === ITransferSide.outgoing && token?.type === ITokenType.GovernanceERC20) {
        removeFromDao =
          BigInt(memberTransaction.memberBalance) === 0n && BigInt(memberTransaction.memberVotingPower) === 0n
      }

      if (transferType === ITransferSide.outgoing && token?.type === ITokenType.ERC721) {
        removeFromDao =
          (await Web3Helper.getTokenBalanceAtBlock({
            address: memberAddress,
            tokenAddress: info.address,
            blockNumber: info.blockNumber,
            network: info.network,
          })) === '0'
      }

      if (removeFromDao) {
        await Promise.all(
          plugins.map(async (plugin: Plugin) => GovernanceErc20Handler._removeFromDao(memberAddress, plugin)),
        )
      }

      logger.verbose(`Transfer ${transferType} - MemberTransaction`, llo({ logId: memberTransaction?.id, info }))

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
      logger.error(`Transfer - ${transferType} transfer error`, llo({ error, info }))
    }
  },

  _addMemberToDao: async (memberAddress: string, plugin: Plugin) => {
    await ProxyMember.addToDao({
      memberAddress,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      tokenAddress: plugin.tokenAddress,
      network: plugin.network,
    })
  },

  _removeFromDao: async (memberAddress: string, plugin: Plugin) => {
    await ProxyMember.removeFromDao({
      memberAddress,
      daoAddress: plugin.daoAddress,
      pluginAddress: plugin.address,
      tokenAddress: plugin.tokenAddress,
      network: plugin.network,
    })
  },

  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
    // when realtime the plugin is undefined, check if related to aragon dao
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    if (parsedEvent.args.delegate === utils.zeroAddress) {
      return
    }

    const memberAddress = parsedEvent.args.delegate

    try {
      await ProxyMember.createMember(memberAddress)

      const tokenBalance = await ProxyMember.getBalances({
        address: memberAddress,
        tokenAddress: info.address,
        network: info.network,
      })

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
        await Promise.all(
          plugins.map(async (plugin: Plugin) => GovernanceErc20Handler._addMemberToDao(memberAddress, plugin)),
        )
      } else {
        // remove member from dao
        if (BigInt(memberBalance) === 0n && newVotingPower === 0n) {
          await Promise.all(
            plugins.map(async (plugin: Plugin) => GovernanceErc20Handler._removeFromDao(memberAddress, plugin)),
          )
        }
      }

      const { from, to } = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      if (from === utils.zeroAddress || to === utils.zeroAddress || from === to) {
        // Note we skip all delegation happened on transfer, mint, burn, etc
        return
      }

      let side: ITransferSide
      if (memberAddress === from) {
        side = ITransferSide.outgoing
      } else if (memberAddress === to) {
        side = ITransferSide.incoming
      } else {
        // cannot detect side
        logger.error('Error cannot detect delegation side', llo({ from, to, memberAddress, info }))
        return
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

      await Promise.all(
        plugins.map(async (plg: Plugin) => {
          if (side === ITransferSide.incoming) {
            await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateReceivedCount, {
              memberAddress,
              pluginAddress: plg.address,
              network: plg.network,
            })
          } else if (side === ITransferSide.outgoing) {
            await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateSentCount, {
              memberAddress,
              pluginAddress: plg.address,
              network: plg.network,
            })
          }

          await ProxyMember.updateActivity({
            memberAddress,
            pluginAddress: plg.address,
            network: info.network,
            blockNumber: info.blockNumber,
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
    } catch (error) {
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
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
        ({ parsed }: { parsed: LogDescription | null }) =>
          parsed?.args?.fromDelegate === parsedEvent?.args?.delegate ||
          parsed?.args?.toDelegate === parsedEvent?.args?.delegate,
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
