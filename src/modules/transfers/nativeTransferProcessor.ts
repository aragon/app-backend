import { ITransactionSide, type ISaveTransactionParams, type NetworksEnum, type ILogInfo } from '@types'
import { ITransactionType } from '@src/types/transfer'
import utils from '@helpers/utils'
import { ethers, type LogDescription } from 'ethers'
import { TransferProcessor } from './transferProcessor'

export class NativeTransferProcessor extends TransferProcessor {
  private readonly transactionSide: ITransactionSide

  constructor(network: NetworksEnum, daoAddress: string, transactionSide: ITransactionSide = ITransactionSide.deposit) {
    super(network, daoAddress)
    this.transactionSide = transactionSide
  }

  getTransferType(): ITransactionType {
    return ITransactionType.native
  }

  validateTransfer(parsedEvent: LogDescription): boolean {
    return parsedEvent.args.length >= 2
  }

  prepareTransferData(parsedEvent: LogDescription, info: ILogInfo): ISaveTransactionParams {
    // For NativeTokenDeposited event: sender and amount properties
    // For Executed event native transfers: recipient/to and amount properties
    const isIncoming = this.transactionSide === ITransactionSide.deposit
    const address = parsedEvent.args.sender || parsedEvent.args.recipient || parsedEvent.args.to || parsedEvent.args[0]
    const amount = parsedEvent.args.amount ?? parsedEvent.args.value ?? parsedEvent.args[1]

    return {
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      network: info.network,
      side: this.transactionSide,
      type: ITransactionType.native,
      fromAddress: isIncoming ? address : this.daoAddress,
      toAddress: isIncoming ? this.daoAddress : address,
      value: ethers.formatEther(amount),
      daoAddress: this.daoAddress,
      tokenAddress: utils.zeroAddress,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    }
  }
}
