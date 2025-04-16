import logger from '@logger'
import { type LogDescription } from 'ethers'
import {
  EnumQueueName,
  IEventLogMember,
  type ILogInfo,
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
import Web3Utils from '@helpers/web3Utils'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import type Plugin from '@models/schema/plugin'
import RabbitMQHelper from '@helpers/rabbitMQ'
import config from '@config'
import { ProxyToken } from '@modules/proxyToken'
import type MemberTransaction from '@models/schema/memberTransaction'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceErc20Handler' })

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

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTransfer token not found', llo({ info }))
      }

      if (existingLog) {
        return await GovernanceErc20Handler._handleDaoMemberShip(
          existingLog,
          token?.type!,
          token?.isGovernance!,
          plugins,
          info,
          isHistorical,
        )
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

      let tokenBal: string = '0'
      let memberVotingPower: string = '0'

      if (token?.type === ITokenType.ERC20 && token?.isGovernance) {
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

      await GovernanceErc20Handler._handleDaoMemberShip(
        memberTransaction,
        token?.type!,
        token?.isGovernance!,
        plugins,
        info,
        isHistorical,
      )
    } catch (error) {
      logger.error(`Transfer - ${transferType} transfer error`, llo({ error, info }))
    }
  },

  _handleDaoMemberShip: async (
    memberTx: Partial<MemberTransaction>,
    tokenType: ITokenType,
    tokenIsGovernance: boolean,
    plugins: Plugin[],
    info: ILogInfo,
    isHistorical?: boolean,
  ) => {
    let userBalance = 0n
    let votingPower = 0n

    if (tokenType === ITokenType.ERC20 && tokenIsGovernance) {
      votingPower = BigInt(memberTx.memberVotingPower!)
      userBalance = BigInt(memberTx.memberBalance!)
    } else {
      userBalance = BigInt(
        await Web3Helper.getTokenBalanceAtBlock({
          address: memberTx.address!,
          tokenAddress: info.address,
          blockNumber: info.blockNumber,
          network: info.network,
        }),
      )
    }

    await Promise.all([
      ...plugins.map(async (plugin: Plugin) => {
        const memberShipParams = {
          memberAddress: memberTx.address!,
          daoAddress: plugin.daoAddress,
          network: plugin.network,
          pluginAddress: plugin.address,
          tokenAddress: plugin.tokenAddress,
        }

        const isMember = await ProxyMember.isMemberOfDao(memberShipParams)
        const meetsRequirements = tokenIsGovernance ? votingPower > 0n || userBalance > 0n : BigInt(userBalance) > 0n

        if (!isMember && meetsRequirements) {
          await ProxyMember.addToDao(memberShipParams)
        } else if (isMember && !meetsRequirements) {
          await ProxyMember.removeFromDao(memberShipParams)
        }
      }),
    ])

    if (!isHistorical) {
      const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
      uniqueDaoList.map(async (daoAddress: string) => {
        await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: daoAddress,
          params: { address: daoAddress, network: info.network },
        })
      })
    }
  },

  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo, isHistorical?: boolean) => {
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    try {
      const memberAddress = parsedEvent.args.delegate
      const tokenAddress = info.address
      const network = info.network

      await ProxyMember.createMember(memberAddress)

      const tokenBalance = await ProxyMember.getBalances({
        address: memberAddress,
        tokenAddress,
        network,
      })

      const votingPowerResult = await DbTx.executeTxFn(async ({ session }) => {
        const existingLog = await Models.MemberTransaction.findExistingLog(
          {
            network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            address: memberAddress,
          },
          { session },
        )

        if (existingLog) {
          return existingLog
        }

        const newVotingPower = BigInt(parsedEvent?.args?.newBalance || 0)
        await tokenBalance?.updateVotingPower(newVotingPower.toString(), info.blockNumber, { session })
        await session.commitTransaction()
        await session.endSession()
        return newVotingPower
      })

      if (typeof votingPowerResult !== 'bigint') {
        return await GovernanceErc20Handler._handleDaoMemberShip(
          votingPowerResult as MemberTransaction,
          ITokenType.ERC20,
          true,
          plugins,
          info,
          isHistorical,
        )
      }

      const memberBalance = await Web3Helper.getTokenBalanceAtBlock({
        address: memberAddress,
        tokenAddress,
        blockNumber: info.blockNumber,
        network,
      })

      await GovernanceErc20Handler._handleDaoMemberShip(
        {
          address: memberAddress,
          memberBalance: memberBalance.toString(),
          memberVotingPower: votingPowerResult.toString(),
        },
        ITokenType.ERC20,
        true,
        plugins,
        info,
        isHistorical,
      )

      const { from, to, delegator } = await GovernanceErc20Handler._findDelegatorsFromReceipt(parsedEvent, info)

      if ((from === utils.zeroAddress && to === utils.zeroAddress) || from === to) {
        // Note we skip all delegation happened on transfer, mint, burn, etc
        logger.warn('Skip from and to address', llo({ from, to, info }))
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
            network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
            blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
            address: memberAddress,
            delegator,
            type: ITransferType.delegate,
            side,
            from,
            to,
            amount: BigInt(parsedEvent?.args?.value || 0).toString(),
            tokenAddress,
            memberBalance,
            memberVotingPower: votingPowerResult.toString(),
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
      })

      await Promise.all(
        plugins.map(async (plg: Plugin) => {
          await ProxyMember.updateDelegationMetrics({
            memberAddress,
            pluginAddress: plg.address,
            tokenAddress,
            network,
          })

          await ProxyMember.updateActivity({
            memberAddress,
            pluginAddress: plg.address,
            blockNumber: info.blockNumber,
            network,
          })

          // if (side === ITransferSide.outgoing) {
          //   // decrease received delegation
          //   await ProxyMember.updateMetricsByAction(IMetricAction.decreaseDelegateReceivedCount, {
          //     memberAddress,
          //     pluginAddress: plg.address,
          //     network: plg.network,
          //   })
          //
          //   await ProxyMember.updateActivity({
          //     memberAddress,
          //     pluginAddress: plg.address,
          //     network: info.network,
          //     blockNumber: info.blockNumber,
          //   })
          // } else if (side === ITransferSide.incoming) {
          //   // increase received delegation
          //   await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateReceivedCount, {
          //     memberAddress,
          //     pluginAddress: plg.address,
          //     network: plg.network,
          //   })
          //
          //   await ProxyMember.updateActivity({
          //     memberAddress,
          //     pluginAddress: plg.address,
          //     network: info.network,
          //     blockNumber: info.blockNumber,
          //   })
          // }
        }),
      )
    } catch (error) {
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
    }
  },

  _findDelegatorsFromReceipt: async (parsedEvent: LogDescription, info: ILogInfo) => {
    let from = utils.zeroAddress
    let to = utils.zeroAddress
    let delegator = utils.zeroAddress

    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)

    if (txReceipt) {
      const delegationChangedLogs = Web3Utils.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      const log = delegationChangedLogs?.find(
        ({ parsed }: { parsed: LogDescription | null }) =>
          parsed?.args?.fromDelegate === parsedEvent?.args?.delegate ||
          parsed?.args?.toDelegate === parsedEvent?.args?.delegate,
      )

      if (log?.parsed?.args?.delegator) {
        delegator = log?.parsed?.args.delegator
      }

      if (log?.parsed?.args?.fromDelegate) {
        from = log.parsed.args.fromDelegate
      }

      if (log?.parsed?.args?.toDelegate) {
        to = log.parsed.args.toDelegate
      }
    }

    return { from, to, delegator }
  },
}
