import { type HexAddress, type IAssetTransferTxLog, type ITransactionType, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Dao from '@models/schema/dao'
import type Transaction from '@models/schema/transaction'
import Web3Helper from '@helpers/web3'
import { DAO } from '@artifacts/dao'
import { Multisig } from '@artifacts/Multisig'

import AssetTransferProvider from '@providers/assetTransafersProvider/providerFactory'
const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoTransactions' })

/**
 * The DaoTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */
export const DaoTransactions = {
  start: async ({ daoAddress, network }: { daoAddress: HexAddress; network: NetworksEnum }) => {
    try {
      const startTime = Date.now()
      logger.verbose('Start DaoTransactions', llo({ daoAddress, startTime }))

      const daoDb = await Models.Dao.findByAddress(daoAddress, network)
      if (!daoDb) return

      await AssetTransferProvider.getAssetTransfers(daoDb, DaoTransactions.saveTransaction)

      const duration = Date.now() - startTime
      logger.verbose('End DaoTransactions', llo({ daoId: daoDb.id, daoAddress, duration: `${duration}ms` }))
    } catch (error) {
      logger.error('Error start DaoTransactions', llo({ daoAddress, error }))
    }
  },

  saveTransaction: async (tx: IAssetTransferTxLog, type: ITransactionType, dao: Dao) => {
    try {
      /**
       * If the transaction is a proposal execution
       * We get two events from the DAO contract
       * - Executed (The address when the proposal was executed is the DAO address)
       * - ProposalExecuted (The proposalIndex is the topic of the log)
       */

      let daoAddress = dao.address
      let pluginAddress: string | undefined
      let proposalIndex: string | undefined

      const existingLog = await Models.Transaction.findExistingLog({
        transactionHash: tx.hash,
        network: dao.network,
        category: tx.category,
        uniqueId: tx.uniqueId,
      })

      if (existingLog) {
        logger.verbose('Transaction already saved', llo({ logId: existingLog.id }))
        return
      }

      const transactionReceipt = await Web3Helper.getTransactionReceipt(tx.hash, dao.network)

      if (transactionReceipt) {
        const proposalExecutionLog = Web3Helper.findLogsByName(transactionReceipt, 'Executed', DAO.abi)
        if (proposalExecutionLog?.length) {
          daoAddress = proposalExecutionLog[0].txLog.address

          const proposalIdLog = Web3Helper.findLogsByName(transactionReceipt, 'ProposalExecuted', Multisig.abi)
          pluginAddress = proposalIdLog[0].txLog.address

          if (proposalIdLog?.length) {
            proposalIndex = proposalIdLog[0].txLog.topics[1].toString()
          }
        }
      }
      const rawTx: Partial<Transaction> = {
        transactionHash: tx.hash,
        uniqueId: tx.uniqueId,
        blockNumber: Number(tx.blockNum),
        blockTimestamp: tx.blockTimestamp,
        network: dao.network,
        type,
        daoAddress,
        pluginAddress,
        fromAddress: tx.from,
        toAddress: tx.to,
        value: tx.value?.toString() || '0',
        tokenId: tx.tokenId ? BigInt(tx.tokenId).toString() : undefined,
        erc721TokenId: tx.erc721TokenId ? BigInt(tx.erc721TokenId).toString() : undefined,
        erc1155Metadata: tx.erc1155Metadata?.map((w: any) => ({
          tokenId: BigInt(w.tokenId)?.toString(),
          value: w.value?.toString(),
        })),
        category: tx.category,
        proposalIndex,
      }

      if (tx.rawContract?.address) {
        rawTx.tokenAddress = tx.rawContract.address

        rawTx.token = {
          network: dao.network,
          address: tx.rawContract.address,
          symbol: tx.rawContract.symbol,
          name: tx.rawContract.name,
          type: tx.rawContract.type,
          logo: tx.rawContract.logo!,
          decimals: tx.rawContract.decimals,
          snapshot: {
            priceUsd: tx.rawContract.priceUsd.toString(),
            priceUpdatedAt: tx.rawContract.priceUpdatedAt,
          },
        }
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.Transaction.create(rawTx, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
        return logDb
      })
    } catch (error) {
      logger.error('Error saveTransaction', llo({ error, logId: dao.id, txHash: tx.hash }))
    }
  },
}
