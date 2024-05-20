import logger from '@logger'
import { ITransactionType, type NetworksEnum } from '@types'
import { type LogDescription, ZeroAddress } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import { TransactionActionHandler } from '@services/indexer/handlers/transactionActionHandler'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  callbackReceived: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    logger.verbose('callbackReceived', llo({ txHash: txLog.transactionHash, network }))
  },

  deposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    try {
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

          const logDb = await Models.LogTransaction.create(transaction, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New Deposit', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error Deposit', llo({ logInfo, error }))
    }
  },

  executed: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    const actions = parsedEvent.args.actions

    const handleAction = async (action: any, index: number) => {
      try {
        switch (true) {
          case Web3Helper.isNativeTokenAction(action): {
            await TransactionActionHandler.nativeToken(parsedEvent, txLog, network, action, index)
            break
          }
          case Web3Helper.isERC20Transfer(action): {
            // both ERC20Transfer ERC721Transfer have the same signature transferFrom
            // https://github.com/code-423n4/2022-06-putty-findings/issues/52
            // check if the token is ERC20 or ERC721 via token decimals
            const token = await Web3Helper.getERC20Info(action.to, network)
            if (token.decimals) {
              await TransactionActionHandler.erc20Token(parsedEvent, txLog, network, action, index)
            } else {
              await TransactionActionHandler.erc721Token(parsedEvent, txLog, network, action, index)
            }
            break
          }
          case Web3Helper.isERC721Transfer(action): {
            await TransactionActionHandler.erc721Token(parsedEvent, txLog, network, action, index)
            break
          }
          case Web3Helper.isERC1155TransferMethod(action): {
            await TransactionActionHandler.erc1155Token(parsedEvent, txLog, network, action, index)
            break
          }
          default: {
            const methodSig = Web3Helper.getMethodSignature(action.data)
            logger.error('Unhandled action', llo({ logInfo, parsedEvent, action, index, methodSig }))
            break
          }
        }
      } catch (error) {
        logger.error('Error handling action', llo({ logInfo, parsedEvent, action, index, error }))
      }
    }

    await Promise.all(actions.map(handleAction))
  },

  nativeTokenDeposited: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    try {
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

          const logDb = await Models.LogTransaction.create(transaction, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New NativeToken Deposit', llo({ logId: logDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Error NativeToken Deposit', llo({ logInfo, error }))
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
}
