import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, type HexAddress, type ILogInfo, ITransferSide, ITransferType } from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import type Plugin from '@models/schema/plugin'
import RabbitMQHelper from '@helpers/rabbitMQ'
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

  _handleTransfer: async (
    parsedEvent: LogDescription,
    info: ILogInfo,
    transferType: ITransferSide,
    plugins: Plugin[],
    isHistorical?: boolean,
  ) => {
    try {
      const memberAddress = transferType === ITransferSide.incoming ? parsedEvent.args.to : parsedEvent.args.from

      const existingLog = await Models.MemberTransaction.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        address: memberAddress,
      })
      if (existingLog) return

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTransfer token not found', llo({ info }))
        return
      }

      await ProxyMember.createMember(memberAddress)
      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      const [memberVotingPower, memberTokenBalance, memberTokenBalanceDb] = await Promise.all([
        GovernanceErc20Helper.getPastVotes(
          memberAddress,
          info.address,
          info.blockNumber,
          blockTimestamp,
          info.network,
          token?.clockMode,
        ),
        Web3Helper.getTokenBalanceAtBlock({
          address: memberAddress,
          tokenAddress: info.address,
          blockNumber: info.blockNumber,
          network: info.network,
        }),
        ProxyMember.getBalances({
          address: memberAddress,
          tokenAddress: info.address,
          network: info.network,
        }),
      ])

      const tokenId = parsedEvent.args.tokenId !== undefined ? (parsedEvent.args.tokenId || 0).toString() : undefined

      const memberTransaction = await DbTx.executeTxFn(async ({ session }) => {
        const tokenIds = memberTokenBalanceDb?.tokenIds || []
        if (tokenId !== undefined && !tokenIds.includes(tokenId)) {
          tokenIds.push(tokenId)
        }
        await memberTokenBalanceDb?.update(
          {
            amount: memberTokenBalance,
            votingPower: memberVotingPower,
            tokenIds,
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
            amount: parsedEvent.args.value?.toString(),
            tokenAddress: info.address,
            memberBalance: memberTokenBalance,
            memberVotingPower,
            tokenId,
          },
          { session },
        )

        await session.commitTransaction()
        await session.endSession()
        return memberTransaction
      })

      await GovernanceErc20Handler._handleDaoMemberShip(memberTransaction, plugins, info, isHistorical)
    } catch (error) {
      logger.error(`Transfer - ${transferType} transfer error`, llo({ error, info }))
    }
  },

  _handleDaoMemberShip: async (
    memberTx: Partial<MemberTransaction>,
    plugins: Plugin[],
    info: ILogInfo,
    isHistorical?: boolean,
  ) => {
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
        const meetsRequirements = BigInt(memberTx?.memberVotingPower!) > 0n || BigInt(memberTx?.memberBalance!) > 0n

        if (!isMember && meetsRequirements) {
          await ProxyMember.addToDao(memberShipParams)
        } else if (isMember && !meetsRequirements) {
          await ProxyMember.removeFromDao(memberShipParams)
        }
      }),
    ])

    if (!isHistorical) {
      const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
      await Promise.all(
        uniqueDaoList.map(async (daoAddress: string) => {
          await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: daoAddress,
            params: { address: daoAddress, network: info.network },
          })
        }),
      )
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

      if (memberAddress === utils.zeroAddress) return

      const existingLog = await Models.MemberTransaction.findExistingLog({
        network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        address: memberAddress,
      })
      if (existingLog) return

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTransfer token not found', llo({ info }))
        return
      }

      await ProxyMember.createMember(memberAddress)
      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      const [memberVotingPower, memberTokenBalance, memberTokenBalanceDb] = await Promise.all([
        GovernanceErc20Helper.getPastVotes(
          memberAddress,
          info.address,
          info.blockNumber,
          blockTimestamp,
          info.network,
          token?.clockMode,
        ),
        Web3Helper.getTokenBalanceAtBlock({
          address: memberAddress,
          tokenAddress: info.address,
          blockNumber: info.blockNumber,
          network: info.network,
        }),
        ProxyMember.getBalances({
          address: memberAddress,
          tokenAddress: info.address,
          network: info.network,
        }),
      ])

      const newBalance = BigInt(parsedEvent?.args?.newBalance || 0)
      const previousBalance = BigInt(parsedEvent?.args?.previousBalance || 0)

      let side: ITransferSide
      let from: HexAddress | null = null
      let to: HexAddress | null = null
      if (newBalance > previousBalance) {
        side = ITransferSide.incoming
        to = memberAddress
      } else {
        side = ITransferSide.outgoing
        from = memberAddress
      }

      // save member transaction
      const memberTx = await DbTx.executeTxFn(async ({ session }) => {
        await memberTokenBalanceDb?.update(
          {
            amount: memberTokenBalance,
            votingPower: memberVotingPower,
          },
          { session },
        )

        const logDb = await Models.MemberTransaction.create(
          {
            network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
            blockTimestamp,
            address: memberAddress,
            type: ITransferType.delegate,
            side,
            amount: BigInt(parsedEvent?.args?.value || 0).toString(),
            tokenAddress,
            memberBalance: memberTokenBalance,
            memberVotingPower,
            from,
            to,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
        return logDb
      })

      await GovernanceErc20Handler._handleDaoMemberShip(memberTx, plugins, info, isHistorical)

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
        }),
      )
    } catch (error) {
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
    }
  },
}
