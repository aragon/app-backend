import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, type HexAddress, type ILogInfo, ITransferSide, ITransferType } from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import type Plugin from '@models/schema/plugin'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ProxyToken } from '@modules/proxyToken'
import type MemberTransaction from '@models/schema/memberTransaction'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceErc20Handler' })

export const GovernanceErc20Handler = {
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

      const memberTokenBalanceDb = await ProxyMember.getBalances({
        address: memberAddress,
        tokenAddress: info.address,
        network: info.network,
      })

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
            votingPower: newBalance.toString(),
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
            memberVotingPower: newBalance.toString(),
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
        const meetsRequirements = BigInt(memberTx?.memberVotingPower!) > 0n

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
}
