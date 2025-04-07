import { type HexAddress, type ITransactionType, type NetworksEnum } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Transaction from '@models/schema/transaction'
import Web3Helper from '@helpers/web3'
import { DAO } from '@artifacts/dao'
import { Multisig } from '@artifacts/Multisig'
import ProxyWeb3Provider from '@modules/proxyProvider'
import Web3Utils from '@helpers/web3Utils'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'

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

      const txns = await ProxyWeb3Provider.fetchAddressTxns({
        address: daoDb.address,
        network: daoDb.network,
        blockNumber: daoDb.blockNumber,
      })

      if (!txns?.length) {
        logger.verbose('No transactions found', llo({ daoId: daoDb.id, daoAddress }))
        return
      }

      await Promise.all(
        txns.map(async (tx: any) => {
          await DaoTransactions.saveTransaction(tx, tx.type, daoDb.address, daoDb.network)
        }),
      )

      const duration = Date.now() - startTime
      logger.verbose('End DaoTransactions', llo({ daoId: daoDb.id, daoAddress, duration: `${duration}ms` }))
    } catch (error) {
      logger.error('Error start DaoTransactions', llo({ daoAddress, error }))
    }
  },

  saveTransaction: async (tx: any, type: ITransactionType, daoAddress: HexAddress, network: NetworksEnum) => {
    try {
      /**
       * If the transaction is a proposal execution
       * We get two events from the DAO contract
       * - Executed (The address when the proposal was executed is the DAO address)
       * - ProposalExecuted (The proposalIndex is the topic of the log)
       */

      let pluginAddress: string | undefined
      let proposalIndex: string | undefined

      const existingLog = await Models.Transaction.findExistingLog({
        transactionHash: tx.hash,
        network,
        category: tx.category,
        uniqueId: tx.uniqueId,
      })

      if (existingLog) {
        logger.verbose('Transaction already saved', llo({ logId: existingLog.id }))
        return
      }

      const transactionReceipt = await Web3Helper.getTransactionReceipt(tx.hash, network)

      if (transactionReceipt) {
        const proposalExecutionLog = Web3Utils.findLogsByName(transactionReceipt, 'Executed', DAO.abi)
        if (proposalExecutionLog?.length) {
          daoAddress = proposalExecutionLog[0].txLog.address

          const proposalIdLog = Web3Utils.findLogsByName(transactionReceipt, 'ProposalExecuted', Multisig.abi)
          pluginAddress = proposalIdLog[0].txLog.address

          if (proposalIdLog?.length) {
            proposalIndex = proposalIdLog[0].txLog.topics[1].toString()
          }
        }
      }

      const tokenAddress = tx.rawContract?.address || utils.zeroAddress
      const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
      if (!token) return

      const rawTx: Partial<Transaction> = {
        transactionHash: tx.hash,
        uniqueId: tx.uniqueId,
        blockNumber: Number(tx.blockNum),
        blockTimestamp: tx.blockTimestamp,
        network,
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

      rawTx.tokenAddress = token.address

      rawTx.token = {
        network,
        address: token.address,
        symbol: token.symbol || '',
        name: token?.name || '',
        type: token.type || '',
        logo: token.logo || '',
        decimals: token.decimals,
        snapshot: {
          priceUsd: tx.rawContract?.priceUsd?.toString() || '0',
          priceUpdatedAt: tx.rawContract?.priceUpdatedAt,
        },
      }

      return await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.Transaction.create(rawTx, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
        return logDb
      })
    } catch (error) {
      logger.error('Error saveTransaction', llo({ error, logId: `${daoAddress}-${network}`, txHash: tx.hash }))
    }
  },
}
