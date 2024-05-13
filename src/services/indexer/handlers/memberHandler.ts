import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription, ZeroAddress } from 'ethers'
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
          address: txLog.address, // address not exists in logmember
          creatorAddress: parsedEvent.args.creator, // not exists
          members: parsedEvent.args.members,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Member added', llo({ daoMember }))
      })
    }
  },

  membersRemoved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('membersRemoved', llo({ parsedEvent }))

    const existingLog = await Models.LogMember.findTxHash(txLog.transactionHash)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoMember = {
          network,
          event: parsedEvent.name,
          address: txLog.address, // address not exists in logmember
          creatorAddress: parsedEvent.args.creator, // not exists
          members: parsedEvent.args.members,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Member removed', llo({ daoMember }))
      })
    }
  },

  delegateChanged: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('delegateChanged', llo({ parsedEvent }))

    const existingLog = await Models.LogMember.findTxHashAndEvent(txLog.transactionHash, parsedEvent.name)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoMember = {
          transactionHash: txLog.transactionHash,
          blockNumber: txLog.blockNumber,
          network,
          event: parsedEvent.name,
          tokenAddress: txLog.address,
          fromDelegate: parsedEvent.args.fromDelegate === ZeroAddress ? parsedEvent.args.delegator : parsedEvent.args.fromDelegate,
          toDelegate: parsedEvent.args.toDelegate,
        }

        await Models.LogMember.create(daoMember, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Member Delegation Changed', llo({ daoMember }))
      })
    }
  },

  delegateVotesChanged: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('delegateVotesChanged', llo({ parsedEvent }))
    const existingLog = await Models.LogMember.findTxHashAndEvent(txLog.transactionHash, parsedEvent.name)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {

        // TODO:
        // parsedEvent.args.delegate // address of the delegator
        // parsedEvent.args.previousBalance // delegator balance before
        // parsedEvent.args.newBalance // delegator balance after

        // TODO wrong data :
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
        logger.verbose('New Member Delegation Votes Changed', llo({ daoMember }))
      })
    }
  },
}
