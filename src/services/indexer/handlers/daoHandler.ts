import logger from '@logger'
import { ITransactionType, type NetworksEnum } from '@types'
import { type LogDescription, ZeroAddress } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  callbackReceived: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('callbackReceived', llo({ parsedEvent }))
  },

  deposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo = {
      transactionHash: txLog.transactionHash,
      network,
    }

    const actionIndex = 0
    const type = ITransactionType.deposit
    const existingLog = await Models.LogTransaction.findExistingLog(txLog.transactionHash, type, actionIndex)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const transaction: any = {
          network,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          from: parsedEvent.args.sender,
          to: txLog.address, // dao address
          amount: Number(parsedEvent.args.amount),
          type,
          actionIndex,
        }

        if (parsedEvent.args.token && parsedEvent.args.token !== ZeroAddress) {
          // ERC20 transfer
          transaction.tokenAddress = parsedEvent.args.token
        } else {
          // Native token transfer
          transaction.reference = parsedEvent.args._reference
        }

        const logTxDb = await Models.LogTransaction.create(transaction, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Log Deposit',
          llo({
            logInfo,
            dbId: logTxDb.id,
          }),
        )
      })
    }
  },

  executed: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('executed', llo({ parsedEvent }))
  },

  granted: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('granted', llo({ parsedEvent }))
  },

  nativeTokenDeposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('nativeTokenDeposited', llo({ parsedEvent }))

    const actionIndex = 0
    const type = ITransactionType.deposit
    const existingLog = await Models.LogTransaction.findExistingLog(txLog.transactionHash, type, actionIndex)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {
        const transaction: any = {
          network,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          from: parsedEvent.args.sender,
          to: txLog.address, // dao address
          amount: Number(parsedEvent.args.amount),
          type,
          actionIndex,
        }

        await Models.LogTransaction.create(transaction, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Native Token Deposit', llo({ transaction }))
      })
    }
  },

  newURI: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo = {
      transactionHash: txLog.transactionHash,
      network,
    }

    if (!parsedEvent.args.daoURI) {
      logger.verbose('newURI: no daoURI', llo({ logInfo }))
      return
    }

    const existingLog = await Models.LogDaoRegistry.findExistingLog(txLog.transactionHash, txLog.address)

    if (!existingLog) {
      const existingDao = await Models.LogDaoRegistry.findByAddress(txLog.address, network)

      if (!existingDao) {
        logger.verbose(
          'Dao not found',
          llo({
            logInfo,
          }),
        )
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const uriUpdates = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          uri: parsedEvent.args.daoURI,
        }

        await existingDao.addURIUpdates(uriUpdates, session)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose(
          'Log Dao New URI',
          llo({
            uri: parsedEvent.args.uri,
            transactionHash: txLog.transactionHash,
            network,
            daoId: existingDao.id,
          }),
        )
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
