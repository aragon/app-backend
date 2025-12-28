import utils from '@helpers/utils'
import { ITransactionType } from '@src/types/transfer'
import { ITransactionSide, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Erc20TransferProcessor } from './erc20TransferProcessor'
import { Erc721TransferProcessor } from './erc721TransferProcessor'
import { NativeTransferProcessor } from './nativeTransferProcessor'
import { type TransferProcessor } from './transferProcessor'

export class TransferProcessorFactory {
  static create(
    type: ITransactionType,
    network: NetworksEnum,
    daoAddress: string,
    options?: {
      decimals?: number
      transactionSide?: ITransactionSide
    },
  ): TransferProcessor {
    switch (type) {
      case ITransactionType.erc20:
        return new Erc20TransferProcessor(
          network,
          daoAddress,
          options?.decimals ?? 18,
          options?.transactionSide ?? ITransactionSide.deposit,
        )
      case ITransactionType.erc721:
        return new Erc721TransferProcessor(network, daoAddress, options?.transactionSide ?? ITransactionSide.deposit)
      case ITransactionType.native:
        return new NativeTransferProcessor(network, daoAddress, options?.transactionSide ?? ITransactionSide.deposit)
      default:
        throw new Error(`Unknown transfer type: ${type}`)
    }
  }

  static detectType(parsedEvent: LogDescription, tokenAddress?: string): ITransactionType {
    if (parsedEvent.args.length === 3 && parsedEvent.args[2]) {
      return ITransactionType.erc721
    }

    if (!tokenAddress || tokenAddress === utils.zeroAddress) {
      return ITransactionType.native
    }

    return ITransactionType.erc20
  }
}
