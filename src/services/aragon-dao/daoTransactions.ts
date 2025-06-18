import {
  type HexAddress,
  type IRawAction,
  ITokenType,
  ITransactionCategory,
  ITransactionType,
  type NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Transaction from '@models/schema/transaction'
import Web3Helper from '@helpers/web3'
import { DAO } from '@artifacts/dao'
import { Multisig } from '@artifacts/Multisig'
import Web3Utils from '@helpers/web3Utils'
import { ProxyToken } from '@modules/proxyToken'
import utils from '@helpers/utils'
import ProxyProvider from '@modules/proxyProvider'
import type Proposal from '@models/schema/proposal'
import TokenUtils from '@helpers/tokenUtils'

const llo = logger.logMeta.bind(null, { service: 'service:aragon-dao:DaoTransactions' })

/**
 * The DaoTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */
export const DaoTransactions = {
  start: async ({
    daoAddress,
    network,
    proposalId,
  }: {
    daoAddress: HexAddress
    network: NetworksEnum
    proposalId?: string
  }) => {
    try {
      const startTime = Date.now()
      logger.verbose('Start DaoTransactions', llo({ daoAddress, startTime }))

      const daoDb = await Models.Dao.findByAddress(daoAddress, network)
      if (!daoDb) return

      /**
       * on proposal execute native transfer is not supported on some networks
       */
      if (proposalId && !TokenUtils.supportsInternalTransactions(network)) {
        const proposal = await Models.Proposal.findByEntityId(proposalId)

        if (proposal) {
          await DaoTransactions.parseTransactionFromProposalAction(proposal)
        }
      }

      // check if network support internal transfer and proposalId
      const txns = await ProxyProvider.fetchAddressTxns({
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

  parseTransactionFromProposalAction: async (proposal: Proposal) => {
    const actions: IRawAction[] = proposal.rawActions.filter(a => BigInt(a.value) > 0)
    await Promise.all(
      actions?.map(async (action: IRawAction, index) => {
        const uniqueId = `${proposal.id}-${index}`

        const existingTx = await Models.Transaction.findOne({ uniqueId })

        if (existingTx) {
          logger.verbose(
            'Manual internal transaction already exists',
            llo({
              uniqueId,
              logId: existingTx.id,
            }),
          )
          return
        }

        const rawTx: Partial<Transaction> = {
          transactionHash: proposal.executed.transactionHash!,
          uniqueId,
          blockNumber: proposal.executed.blockNumber!,
          blockTimestamp: proposal.executed.blockTimestamp!,
          network: proposal.network,
          type: ITransactionType.withdraw,
          daoAddress: proposal.daoAddress,
          pluginAddress: proposal.pluginAddress,
          fromAddress: action.from,
          toAddress: action.to,
          value: action.value?.toString() || '0',
          category: ITransactionCategory.Internal,
          proposalIndex: proposal.proposalIndex,
        }

        const tokenAddress = utils.zeroAddress
        const token = await ProxyToken.saveAndGetToken(tokenAddress, proposal.network)
        if (!token) return
        rawTx.tokenAddress = token.address

        try {
          const params = {
            ...(token.type === ITokenType.native ? { symbol: token.symbol || undefined } : { address: token.address }),
            network: proposal.network,
            date: proposal.executed.blockTimestamp!,
          }

          const tokenPrice = await ProxyProvider.fetchHistoricalTokenPrice(params)

          rawTx.token = {
            network: proposal.network,
            address: token.address,
            symbol: token.symbol,
            name: token?.name,
            type: token.type,
            logo: token.logo,
            decimals: token.decimals,
            snapshot: {
              priceUsd: tokenPrice,
              priceUpdatedAt: proposal.executed.blockTimestamp!,
            },
          }

          const valueInTokenUnits = parseFloat(rawTx.value || '0') / Math.pow(10, token.decimals)
          rawTx.amountUsd = (valueInTokenUnits * parseFloat(tokenPrice)).toFixed(2)

          return await DbTx.executeTxFn(async ({ session }) => {
            const logDb = await Models.Transaction.create(rawTx, { session } as any)
            await session.commitTransaction()
            await session.endSession()
            logger.verbose('New Transaction', llo({ logId: logDb?.id }))
            return logDb
          })
        } catch (error) {
          logger.error('Error saveTransaction', llo({ error, uniqueId: rawTx.uniqueId }))
        }
      }),
    )
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

      const params = {
        ...(token.type === ITokenType.native ? { symbol: token.symbol || undefined } : { address: token.address }),
        network,
        date: tx.blockTimestamp,
      }

      const tokenPrice = await ProxyProvider.fetchHistoricalTokenPrice(params)

      rawTx.token = {
        network,
        address: token.address,
        symbol: token.symbol,
        name: token?.name,
        type: token.type,
        logo: token.logo,
        decimals: token.decimals,
        snapshot: {
          priceUsd: tokenPrice,
          priceUpdatedAt: tx.blockTimestamp,
        },
      }

      rawTx.amountUsd = (parseFloat(rawTx.value || '0') * parseFloat(tokenPrice)).toFixed(2)

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
