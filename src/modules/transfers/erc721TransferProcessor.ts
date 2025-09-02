import { ITransactionSide, type ISaveTransactionParams, type NetworksEnum, type ILogInfo } from '@types'
import { ITransactionType } from '@src/types/transfer'
import { type LogDescription } from 'ethers'
import { TransferProcessor } from './transferProcessor'

export class Erc721TransferProcessor extends TransferProcessor {
  private readonly transactionSide: ITransactionSide

  constructor(network: NetworksEnum, daoAddress: string, transactionSide: ITransactionSide = ITransactionSide.deposit) {
    super(network, daoAddress)
    this.transactionSide = transactionSide
  }

  getTransferType(): ITransactionType {
    return ITransactionType.erc721
  }

  validateTransfer(parsedEvent: LogDescription): boolean {
    // ERC20 and ERC721 Transfer events have the same signature
    // Both have 3 args: from, to, and value/tokenId
    // We'll accept all and let the token detection determine the actual type
    return parsedEvent.args.length === 3
  }

  prepareTransferData(parsedEvent: LogDescription, info: ILogInfo): ISaveTransactionParams {
    // ERC721 Transfer event has: from, to, tokenId properties
    const from = parsedEvent.args.from ?? parsedEvent.args[0]
    const to = parsedEvent.args.to ?? parsedEvent.args[1]
    const tokenId = (parsedEvent.args.tokenId ?? parsedEvent.args[2]).toString()

    return {
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      network: info.network,
      side: this.transactionSide,
      type: ITransactionType.erc721,
      fromAddress: from,
      toAddress: to,
      value: '1',
      daoAddress: this.daoAddress,
      tokenAddress: info.address,
      tokenId,
      erc721TokenId: tokenId,
      logIndex: info.logIndex,
      transactionIndex: info.transactionIndex,
    }
  }
}
