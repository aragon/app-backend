import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'

import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MemberHandler' })

export const MemberHandler = {
  membersAdded: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersAdded', llo({ parsedEvent }))

    const existingLog = await Models.LogMember.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoMember = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          creatorAddress: parsedEvent.args.creator,
          members: parsedEvent.args.members,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Multi-sig Dao Member List', llo({ daoMember }))
      })
    }

    /**
     * {
     *   members: [
     *     member1,
     *     member2,
     *   ]
     * }
     */
  },

  membersRemoved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersRemoved', llo({ parsedEvent }))

    const existingLog = await Models.LogMember.findTxHash(txLog.transactionHash)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoMember = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          creatorAddress: parsedEvent.args.creator,
          members: parsedEvent.args.members,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Multi-sig Dao Member List', llo({ daoMember }))
      })
    }
  },

  delegateChanged: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('delegateChanged', llo({ parsedEvent }))

    const existingLog = await Models.LogMember.findTxHashAndEvent(txLog.transactionHash, parsedEvent.name)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoMember = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          fromDelegate: parsedEvent.args.fromDelegate,
          toDelegate: parsedEvent.args.toDelegate,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Token Based Dao Member Delegation', llo({ daoMember }))
      })
    }
  },

  delegateVotesChanged: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('delegateVotesChanged', llo({ parsedEvent }))
    const existingLog = await Models.LogMember.findTxHashAndEvent(txLog.transactionHash, parsedEvent.name)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoMember = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          fromDelegate: parsedEvent.args.fromDelegate,
          toDelegate: parsedEvent.args.toDelegate,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Token Based Dao Member Delegation', llo({ daoMember }))
      })
    }
  },
}
