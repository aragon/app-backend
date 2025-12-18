import { Models } from '@dbModels'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type Transaction from '@models/schema/transaction'
import DbTx from '@modules/dbTx'
import { ProxyToken } from '@modules/proxyToken'
import { ITransactionType } from '@src/types/transfer'
import { type ILogInfo, type ISaveTransactionParams, type NetworksEnum } from '@types'
import type { LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'transfers:TransferProcessor' })

export abstract class TransferProcessor {
  protected network: NetworksEnum
  protected daoAddress: string

  constructor(network: NetworksEnum, daoAddress: string) {
    this.network = network
    this.daoAddress = daoAddress
  }

  abstract getTransferType(): ITransactionType

  abstract prepareTransferData(parsedEvent: LogDescription, info: ILogInfo): ISaveTransactionParams

  abstract validateTransfer(parsedEvent: LogDescription): boolean

  async save(transferData: ISaveTransactionParams): Promise<Transaction | undefined> {
    try {
      // Log when we receive a native transfer with actionIndex
      if (transferData.type === ITransactionType.native && transferData.actionIndex !== undefined) {
        logger.info(
          'Processing native transfer with actionIndex',
          llo({
            txHash: transferData.transactionHash,
            actionIndex: transferData.actionIndex,
            type: transferData.type,
          }),
        )
      }

      const existingTx = await this.checkExisting(transferData)
      if (existingTx) {
        logger.verbose('Transaction already exists', llo({ id: existingTx.id, txHash: transferData.transactionHash }))
        return existingTx
      }

      const enrichedData = await this.addTokenMetadata(transferData)
      if (enrichedData) {
        return await this.persist(enrichedData)
      }
    } catch (error) {
      logger.error('Error saving transfer', llo({ error, txHash: transferData.transactionHash }))
      return undefined
    }
  }

  protected async checkExisting(data: ISaveTransactionParams): Promise<Transaction | undefined> {
    const transferType = this.getTransferType()

    // For native transactions with actionIndex, we need to check for the specific transaction with that actionIndex
    if (transferType === ITransactionType.native && data.actionIndex !== undefined && data.actionIndex !== null) {
      // Check for the specific native transaction with this actionIndex
      return await Models.Transaction.findExistingLog({
        transactionHash: data.transactionHash,
        network: data.network,
        daoAddress: data.daoAddress,
        type: transferType,
        actionIndex: data.actionIndex,
      })
    }

    return await Models.Transaction.findExistingLog({
      transactionHash: data.transactionHash,
      network: data.network,
      daoAddress: data.daoAddress,
      type: transferType,
      logIndex: data.logIndex,
      transactionIndex: data.transactionIndex,
      tokenAddress: data.tokenAddress,
      tokenId: data.tokenId || data.erc721TokenId,
      proposalId: data.proposalIndex,
      actionIndex: data.actionIndex,
    })
  }

  protected async addTokenMetadata(data: ISaveTransactionParams): Promise<Partial<Transaction> | null> {
    const tokenAddress = data.tokenAddress || utils.zeroAddress
    const token = await ProxyToken.saveAndGetToken(tokenAddress, data.network)

    if (!token) {
      logger.warn(
        'Failed to get token information. Possible Scam Token',
        llo({ tokenAddress, network: data.network, type: data.type }),
      )
      return null
    }

    const timestamp = data.blockTimestamp || (await Web3Helper.getBlockTimestamp(data.blockNumber, data.network))

    return {
      ...data,
      blockTimestamp: timestamp,
      tokenAddress: token.address,
      token: {
        network: data.network,
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        type: token.type,
        logo: token.logo,
        decimals: token.decimals,
        snapshot: {
          priceUsd: '0',
          priceUpdatedAt: timestamp,
        },
      },
      amountUsd: '0',
    }
  }

  protected async persist(data: Partial<Transaction>): Promise<Transaction> {
    return await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await Models.Transaction.create(data, { session } as any)
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('New Transaction saved', llo({ id: logDb?.id }))
      return logDb
    })
  }
}
