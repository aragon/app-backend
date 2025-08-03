import logger from '@logger'
import { type LogDescription } from 'ethers'
import { EnumQueueName, type HexAddress, type ILogInfo, ITransferSide, ITransferType } from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import RabbitMQHelper from '@helpers/rabbitMQ'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceErc20Handler' })

export const GovernanceErc20Handler = {
  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
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

      const newBalance = BigInt(parsedEvent?.args?.newBalance || 0)
      const previousBalance = BigInt(parsedEvent?.args?.previousBalance || 0)

      let side: ITransferSide
      let from: HexAddress | null = null
      let to: HexAddress | null = null
      let lastActivity: undefined | number
      if (newBalance > previousBalance) {
        side = ITransferSide.incoming
        to = memberAddress
      } else {
        side = ITransferSide.outgoing
        from = memberAddress
        lastActivity = info.blockNumber
      }

      await ProxyMember.createMember(memberAddress, lastActivity)

      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.MemberTransaction.create(
          {
            network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
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

      await ProxyMember.updateVotingPower({
        memberAddress,
        tokenAddress: info.address,
        votingPower: newBalance.toString(),
        network: info.network,
        lastVPBlockNumber: info.blockNumber,
      })

      // only when incoming delegation, we update the delegation metrics
      if (side === ITransferSide.incoming) {
        await ProxyMember.updateDelegationMetrics({
          memberAddress,
          tokenAddress,
          network,
        })
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
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
    }
  },
}
