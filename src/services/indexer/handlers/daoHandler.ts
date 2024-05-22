import logger from '@logger'
import { ITransactionType, type NetworksEnum } from '@types'
import { AbiCoder, type LogDescription, ZeroAddress } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import { TransactionActionHandler } from '@services/indexer/handlers/transactionActionHandler'
import Web3Helper from '@helpers/web3'
import { ERC1155 } from '@artifacts/ERC1155'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:DaoHandler' })

export const DaoHandler = {
  callbackReceived: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
    }

    const daoAddress = txLog.address
    const calldata = '0x' + parsedEvent.args.data.slice(10)
    const functionSig = parsedEvent.args.sig

    switch (functionSig) {
      case Web3Helper.onERC721Received: {
        const decoded = Web3Helper.decodeCalldata(['address', 'address', 'uint256', 'uint8', 'uint8'], calldata)
        if (!decoded) {
          return
        }

        // TODO: handle multiple ERC721 transfer on same txs
        //  onERC721Received will be trigger multiple times with different tokenId
        const actionIndex = 0
        const type = ITransactionType.deposit
        const existingLog = await Models.LogTransaction.findExistingLog(txLog.transactionHash, type, actionIndex)

        if (!existingLog) {
          await DbTx.executeTxFn(async ({ session }) => {
            const transaction: any = {
              network,
              blockNumber: txLog.blockNumber,
              transactionHash: txLog.transactionHash,
              from: decoded[1],
              to: txLog.address, // dao address
              daoAddress,
              tokenAddress: parsedEvent.args.sender,
              tokenId: decoded[2].toString(),
              type: ITransactionType.deposit,
            }

            const logDb = await Models.LogTransaction.create(transaction, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New ERC721 Deposit', llo({ logId: logDb.id, logInfo }))
          })
        }
        break
      }
      case Web3Helper.onERC1155Received: {
        const decoded = AbiCoder.defaultAbiCoder().decode(['address', 'address', 'uint256', 'uint8', 'uint8'], calldata)
        if (!decoded) {
          return
        }

        // TODO: handle multiple ERC721 transfer on same txs
        //  onERC721Received will be trigger multiple times with different tokenId
        const extraData = await Web3Helper.getDataFromTxReceipt({
          txLog,
          eventName: 'TransferSingle',
          abi: ERC1155.abi,
          network,
        })
        if (!extraData) {
          return
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
              daoAddress,
              from:
                extraData.events[0].parsed.args.from !== ZeroAddress
                  ? extraData.events[0].parsed.args.from
                  : extraData.events[0].parsed.args.operator,
              to: extraData.events[0].parsed.args.to,
              amount: Number(extraData.events[0].parsed.args.value),
              tokenAddress: parsedEvent.args.sender,
              tokenId: extraData.events[0].parsed.args.id?.toString(),
              type: ITransactionType.deposit,
            }

            const logDb = await Models.LogTransaction.create(transaction, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New ERC1155 Deposit', llo({ logId: logDb.id, logInfo }))
          })
        }
        break
      }
      case Web3Helper.onERC1155BatchReceived: {
        const decoded = AbiCoder.defaultAbiCoder().decode(
          ['address', 'address', 'uint256[]', 'uint256[]', 'uint8'],
          calldata,
        )
        if (!decoded) {
          return
        }

        const extraData = await Web3Helper.getDataFromTxReceipt({
          txLog,
          eventName: 'TransferBatch',
          abi: ERC1155.abi,
          network,
        })
        if (!extraData) {
          return
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
              daoAddress,
              from:
                extraData.events[0].parsed.args.from !== ZeroAddress
                  ? extraData.events[0].parsed.args.from
                  : extraData.events[0].parsed.args.operator,
              to: extraData.events[0].parsed.args.to,
              tokenAddress: parsedEvent.args.sender,
              tokenIds: extraData.events[0].parsed.args.ids?.map((w: bigint) => w.toString()),
              amounts: extraData.events[0].parsed.args.values?.map((w: bigint) => Number(w)),
              type: ITransactionType.deposit,
            }

            const logDb = await Models.LogTransaction.create(transaction, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New ERC1155 Batch Deposit', llo({ logId: logDb.id, logInfo }))
          })
        }
        break
      }
      default: {
        logger.error('Unhandled functionSig', llo({ parsedEvent, txLog }))
        break
      }
    }
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

          const message = transaction.tokenAddress ? 'ERC20' : 'Native'
          logger.verbose(`New ${message} Deposit`, llo({ logId: logDb.id, logInfo }))
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

    // TODO: if some proposal exchange some token to another token, its not handled here
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
