import logger from '@logger'
import { ITransactionType, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { assert } from '@errors'
import { Multisig } from '@artifacts/Multisig'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:TransactionHandler' })

export const TransactionActionHandler = {
  nativeToken: async (
    parsedEvent: LogDescription,
    txLog: any,
    network: NetworksEnum,
    action: any,
    actionIndex: number,
  ) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
      action,
      actionIndex,
    }

    try {
      const extraData = await Web3Helper.getDataFromTxReceipt({
        txLog,
        eventName: 'ProposalExecuted',
        abi: Multisig.abi,
        network,
      })
      if (!extraData) {
        return
      }

      const proposalId = Number(extraData.events[0].parsed.args.proposalId)
      const pluginAddress = extraData.events[0].txLog.address
      const daoAddress = txLog.address
      const type = ITransactionType.withdraw
      const existingLog = await Models.LogTransaction.findExistingLog(txLog.transactionHash, type, actionIndex)

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const transaction: any = {
            network,
            pluginAddress,
            proposalId,
            blockNumber: txLog.blockNumber,
            transactionHash: txLog.transactionHash,
            from: daoAddress,
            to: action.to,
            amount: Number(action.value),
            reference: '',
            type: ITransactionType.withdraw,
            actionIndex,
            execResult: parsedEvent.args.execResults[actionIndex],
            actor: parsedEvent.args.actor,
          }

          const logTransactionDb = await Models.LogTransaction.create(transaction, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New nativeToken', llo({ logId: logTransactionDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Failed to handle nativeToken', llo({ logInfo, error }))
    }
  },

  erc20Token: async (
    parsedEvent: LogDescription,
    txLog: any,
    network: NetworksEnum,
    action: any,
    actionIndex: number,
  ) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
      action,
      actionIndex,
    }

    try {
      const extraData = await Web3Helper.getDataFromTxReceipt({
        txLog,
        eventName: 'ProposalExecuted',
        abi: Multisig.abi,
        network,
      })
      if (!extraData) {
        return
      }

      const proposalId = Number(extraData.events[0].parsed.args.proposalId)
      const pluginAddress = extraData.events[0].txLog.address
      const tokenAddress = action.to
      const daoAddress = txLog.address
      const functionSelector = action.data.substring(0, 10)
      const calldata = '0x' + action.data.slice(10)
      logInfo.functionSelector = functionSelector

      const decodeABI = Web3Helper.getERC20TransferABI(functionSelector)
      assert(!!decodeABI, 'Unsupported function selector - erc20Token', logInfo)

      const decoded = Web3Helper.decodeCalldata(decodeABI!, calldata)
      assert(!!decodeABI, 'Failed to decode calldata - erc20Token', logInfo)

      const { from, to, amount } = Web3Helper.parseERC20TransferAction(functionSelector, decoded, txLog)
      assert(!!from && !!to, 'Failed to parse action', logInfo)

      const type = Web3Helper.getActionTransactionType(from, to, daoAddress)

      const transaction = {
        pluginAddress,
        proposalId,
        network,
        blockNumber: txLog.blockNumber,
        transactionHash: txLog.transactionHash,
        from,
        to,
        amount,
        reference: null,
        tokenAddress,
        type,
        actionIndex,
        execResult: parsedEvent.args.execResults[actionIndex],
        actor: parsedEvent.args.actor,
      }

      const existingLog = await Models.LogTransaction.findExistingLog(txLog.transactionHash, type, actionIndex)

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const logTransactionDb = await Models.LogTransaction.create(transaction, { session })
          await session.commitTransaction()
          await session.endSession()
          logger.verbose('New erc20Token', llo({ logId: logTransactionDb.id, logInfo }))
        })
      }
    } catch (error) {
      logger.error('Failed to handle erc20Token', llo({ logInfo, error }))
    }
  },

  erc721Token: async (
    parsedEvent: LogDescription,
    txLog: any,
    network: NetworksEnum,
    action: any,
    actionIndex: number,
  ) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
      action,
      actionIndex,
    }

    try {
      const extraData = await Web3Helper.getDataFromTxReceipt({
        txLog,
        eventName: 'ProposalExecuted',
        abi: Multisig.abi,
        network,
      })
      if (!extraData) {
        return
      }

      const proposalId = Number(extraData.events[0].parsed.args.proposalId)
      const pluginAddress = extraData.events[0].txLog.address
      const tokenAddress = action.to
      const daoAddress = txLog.address
      const functionSelector = action.data.substring(0, 10)
      const calldata = '0x' + action.data.slice(10)
      logInfo.functionSelector = functionSelector

      const support = await Web3Helper.supportsERC721(tokenAddress, network)
      assert(!!support, 'Token Contract unsupported - erc721Token', logInfo)

      const decodeABI = Web3Helper.getERC721TransferABI(functionSelector)
      assert(!!decodeABI, 'Unsupported function selector - erc721Token', logInfo)

      const decoded = Web3Helper.decodeCalldata(decodeABI!, calldata)
      assert(!!decoded, 'Failed to decode calldata - erc721Token', logInfo)

      const { from, to, tokenId } = Web3Helper.parseERC721Action(decoded)
      assert(!!from && !!to, 'Failed to parse action - erc721Token', logInfo)

      // console.log(functionSelector)

      if (functionSelector === Web3Helper.ERC721_transferFrom) {

        const type = Web3Helper.getActionTransactionType(from, to, daoAddress)

        const transaction: any = {
          pluginAddress,
          proposalId,
          network,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          from,
          to,
          reference: null,
          tokenAddress,
          tokenId,
          type,
          actionIndex,
          execResult: parsedEvent.args.execResults[actionIndex],
          actor: parsedEvent.args.actor,
        }

        const existingLog = await Models.LogTransaction.findExistingLog(
            txLog.transactionHash,
            transaction.type,
            actionIndex,
        )

        if (!existingLog) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logTransactionDb = await Models.LogTransaction.create(transaction, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New erc721Token', llo({ logId: logTransactionDb.id, logInfo }))
          })
        }

      } else {
        logger.error('Unsupported transaction action - erc721Token', llo({ logInfo, decoded }))
      }
    } catch (error) {
      logger.error('Failed to handle erc721Token', llo({ logInfo, error }))
    }
  },

  erc1155Token: async (
    parsedEvent: LogDescription,
    txLog: any,
    network: NetworksEnum,
    action: any,
    actionIndex: number,
  ) => {
    const logInfo: any = {
      txHash: txLog.transactionHash,
      network,
      action,
      actionIndex,
    }

    try {

      const extraData = await Web3Helper.getDataFromTxReceipt({
        txLog,
        eventName: 'ProposalExecuted',
        abi: Multisig.abi,
        network,
      })
      if (!extraData) {
        return
      }

      const proposalId = Number(extraData.events[0].parsed.args.proposalId)
      const pluginAddress = extraData.events[0].txLog.address
      const tokenAddress = action.to
      const daoAddress = txLog.address
      const functionSelector = action.data.substring(0, 10)
      const calldata = '0x' + action.data.slice(10)
      logInfo.functionSelector = functionSelector

      const support = await Web3Helper.supportsERC1155(tokenAddress, network)
      assert(!!support, 'Token Contract unsupported - erc1155Token', logInfo)

      const decodeABI = Web3Helper.getERC1155TransferABI(functionSelector)
      assert(!!decodeABI, 'Unsupported function selector - erc1155Token', logInfo)

      const decoded = Web3Helper.decodeCalldata(decodeABI!, calldata)
      assert(!!decoded, 'Failed to decode calldata - erc1155Token', logInfo)

      // single token transfer
      if (functionSelector === Web3Helper.ERC1155_safeTransferFrom) {
        const { from, to, tokenId, amount } = Web3Helper.parseERC1155Action(decoded)
        assert(!!from && !!to, 'Failed to parse action - erc721Token', logInfo)

        const transaction: any = {
          pluginAddress,
          proposalId,
          network,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          from,
          to,
          amount,
          reference: null,
          tokenAddress,
          tokenId,
          type: ITransactionType.deposit,
          actionIndex,
          execResult: parsedEvent.args.execResults[actionIndex],
          actor: parsedEvent.args.actor,
        }

        const existingLog = await Models.LogTransaction.findExistingLog(
            txLog.transactionHash,
            transaction.type,
            actionIndex,
        )

        if (!existingLog) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logTransactionDb = await Models.LogTransaction.create(transaction, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New erc1155Token', llo({ logId: logTransactionDb.id, logInfo }))
          })
        }
      } else if (functionSelector === Web3Helper.ERC1155_safeBatchTransferFrom) {
        const { from, to, tokenIds, amounts } = Web3Helper.parseERC1155BatchAction(decoded)
        assert(!!from && !!to, 'Failed to parse batch action - erc1155Token', logInfo)

        const transaction: any = {
          pluginAddress,
          proposalId,
          network,
          blockNumber: txLog.blockNumber,
          transactionHash: txLog.transactionHash,
          from,
          to,
          amounts,
          reference: null,
          tokenAddress,
          tokenIds,
          type: ITransactionType.deposit,
          actionIndex,
          execResult: parsedEvent.args.execResults[actionIndex],
          actor: parsedEvent.args.actor,
        }

        const existingLog = await Models.LogTransaction.findExistingLog(
            txLog.transactionHash,
            transaction.type,
            actionIndex,
        )

        if (!existingLog) {
          await DbTx.executeTxFn(async ({ session }) => {
            const logTransactionDb = await Models.LogTransaction.create(transaction, { session })
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New erc1155Token batch', llo({ logId: logTransactionDb.id, logInfo }))
          })
        }
      } else {
        logger.error('Unsupported transaction action - erc1155Token', llo({ logInfo, decoded }))
      }

    } catch (error) {
      logger.error('Failed to handle erc1155Token', llo({ logInfo, error }))
    }
  },
}
