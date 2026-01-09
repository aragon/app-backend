import { ITransactionType } from '@src/types/transfer'
import { type ILogInfo, type ISaveTransactionParams, ITransactionSide, type NetworksEnum } from '@types'
import { ethers, type LogDescription } from 'ethers'
import { TransferProcessor } from './transferProcessor'

export class Erc20TransferProcessor extends TransferProcessor {
  private readonly decimals: number
  private readonly transactionSide: ITransactionSide

  constructor(
    network: NetworksEnum,
    daoAddress: string,
    decimals: number = 18,
    transactionSide: ITransactionSide = ITransactionSide.deposit,
  ) {
    super(network, daoAddress)
    this.decimals = decimals
    this.transactionSide = transactionSide
  }

  getTransferType(): ITransactionType {
    return ITransactionType.erc20
  }

  validateTransfer(parsedEvent: LogDescription): boolean {
    // ERC20 and ERC721 Transfer events have the same signature
    // Both have 3 args: from, to, and value/tokenId
    // We'll accept all and let the token detection determine the actual type
    return parsedEvent.args.length === 3
  }

  prepareTransferData(parsedEvent: LogDescription, info: ILogInfo): ISaveTransactionParams {
    // ERC20 Transfer event has: from, to, amount properties
    const from = parsedEvent.args.from ?? parsedEvent.args[0]
    const to = parsedEvent.args.to ?? parsedEvent.args[1]
    const amount = parsedEvent.args.amount ?? parsedEvent.args.value ?? parsedEvent.args[2]

    return {
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      network: info.network,
      side: this.transactionSide,
      type: ITransactionType.erc20,
      fromAddress: from,
      toAddress: to,
      value: ethers.formatUnits(amount, this.decimals),
      daoAddress: this.daoAddress,
      tokenAddress: info.address,
      logIndex: info.logIndex,
      transactionIndex: info.transactionIndex,
    }
  }
}
