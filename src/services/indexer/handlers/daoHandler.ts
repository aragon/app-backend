import logger from '@logger'
import {DepositType, type NetworksEnum} from '@types'
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

    const existingDao = await Models.LogDaoRegistry.findByAddress(txLog.address, network);

    if(!existingDao) {
      logger.warn('Dao not found', llo({
        txLog
      }))
      return;
    }

    const existingLog = await Models.LogDaoRegistry.findDepositTxHashWithDaoAddress(txLog.transactionHash, existingDao.address)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {

        const depositEvent = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          type: DepositType.Token,
          amount: parsedEvent.args.amount,
          depositor: parsedEvent.args.sender,
          token: parsedEvent.args.token,
        }

        await existingDao.addDeposit(depositEvent, session)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao Token Deposit', llo({ depositEvent }))
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

    const existingDao = await Models.LogDaoRegistry.findByAddress(txLog.address, network);

    if(!existingDao) {
      return;
    }

    const existingLog = await Models.LogDao.findDepositTxHashWithDaoAddress(txLog.transactionHash, existingDao.address)

    if (!existingLog) {
      await DbTx.executeTxFn(async ({ session }) => {

        const depositEvent = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          type: DepositType.NativeToken,
          amount: parsedEvent.args.amount,
          depositor: parsedEvent.args.sender,
        }

        await existingDao.addDeposit(depositEvent, session)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao Native Token Deposit', llo({ depositEvent }))
      })
    }
  },

  newURI: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {

    logger.verbose('newURI', llo({ parsedEvent }))

    if (!parsedEvent.args.daoURI) {
      return
    }

    const existingDao = await Models.LogDaoRegistry.findByAddress(txLog.address)

    if (!existingDao) {
      return
    }

    const existingLog = await Models.LogDao.findURIUpdatesTxHashWithDaoAddress(
      txLog.transactionHash,
      existingDao.address
    )

    if (!existingLog) {

      await DbTx.executeTxFn(async ({ session }) => {

        const uriUpdates = {
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          uri: parsedEvent.args.daoURI,
        }

        await existingDao.addURIUpdates(uriUpdates, session)

        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Log Dao New URI', llo({ uri: parsedEvent.args.uri, txLog }))
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
