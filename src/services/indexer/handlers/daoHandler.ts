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
    logger.verbose('deposited', llo({ parsedEvent }))

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

        if (parsedEvent.args.token !== ZeroAddress) {
          // ERC20 transfer
          transaction.tokenAddress = parsedEvent.args.token
        } else {
          // Native token transfer
          transaction.reference = parsedEvent.args._reference
        }

        await Models.LogTransaction.create(transaction, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Deposit', llo({ transaction }))
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
    logger.verbose('newURI', llo({ parsedEvent }))
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
