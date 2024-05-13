import logger from '@logger'
import { type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  callbackReceived: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('callbackReceived', llo({ parsedEvent }))
  },

  deposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('deposited', llo({ parsedEvent }))

    const existingLog = await Models.LogDao.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoEvent = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,

          tokenDepositAmount: parsedEvent.args.amount,
          tokenAddress: parsedEvent.args.token,
          tokenDepositorAddress: parsedEvent.args.sender,
        }

        await Models.LogDao.create(daoEvent, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao Token Deposit', llo({ daoEvent }))
      })
    }
  },

  executed: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('executed', llo({ parsedEvent }))

    const existingLog = await Models.LogDao.findTxHash(txLog.transactionHash)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoEvent = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,

          actorAddress: parsedEvent.args.actor,
          actions: parsedEvent.args.actions.map((action: any) => ({
            to: action.to,
            value: action.value,
            data: action.data,
          })),
        }

        await Models.LogDao.create(daoEvent, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao Executed', llo({ daoEvent }))
      })
    }
  },

  granted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('granted', llo({ parsedEvent }))
  },

  nativeTokenDeposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('nativeTokenDeposited', llo({ parsedEvent }))

    const existingLog = await Models.LogDao.findTxHash(txLog.transactionHash)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoEvent = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,

          nativeTokenDepositAmount: parsedEvent.args.amount,
          nativeTokenDepositorAddress: parsedEvent.args.sender,
        }

        await Models.LogDao.create(daoEvent, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao Native Token Deposit', llo({ daoEvent }))
      })
    }
  },

  newURI: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('newURI', llo({ parsedEvent }))

    if (!parsedEvent.args.daoURI) {
      return
    }
    const existingLog = await Models.LogDao.findTxHash(txLog.transactionHash)
    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const daoEvent = {
          network,
          event: parsedEvent.name,
          address: txLog.address,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,

          uri: parsedEvent.args.uri,
        }

        await Models.LogDao.create(daoEvent, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao New URI', llo({ daoEvent }))
      })
    }
  },

  revoked: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('revoked', llo({ parsedEvent }))
  },

  standardCallbackRegistered: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('standardCallbackRegistered', llo({ parsedEvent }))
  },

  trustedForwarderSet: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('trustedForwarderSet', llo({ parsedEvent }))
  },
}
