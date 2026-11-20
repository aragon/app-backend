import { Models } from '@dbModels'
import type SafeTransaction from '@models/schema/safeTransaction'
import type Transaction from '@models/schema/transaction'
import MultiSendModule from '@modules/safe/multiSend'
import { TransferProcessorFactory } from '@transfers'
import { type HexAddress, type ILogInfo, ITransactionSide, ITransactionType, NetworksEnum } from '@types'

type SafeExecution = Pick<
  Transaction,
  'network' | 'daoAddress' | 'transactionHash' | 'blockNumber' | 'transactionIndex' | 'logIndex' | 'isSuccessful'
> & { blockTimestamp?: number }

/**
 * The native token a Safe execution sends out, saved as the withdraw rows a DAO gets from its
 * `Executed` event. A Safe has no such event, so the calls come from its stored transaction.
 */
const SafeNativeTransfersModule = {
  async record(execution: SafeExecution, row: SafeTransaction): Promise<void> {
    // On zkSync the native token is also an ERC20, so the token crawler already stores the send.
    if (!execution.isSuccessful || execution.network === NetworksEnum.zksyncMainnet) return

    const transfers = SafeNativeTransfersModule._transfers(row)
    if (!transfers.length) return
    // Only a registered Safe has its transfers crawled.
    if (!(await Models.SafeAccount.findTracked(execution.network, execution.daoAddress))) return

    const processor = TransferProcessorFactory.create(
      ITransactionType.native,
      execution.network,
      execution.daoAddress,
      { transactionSide: ITransactionSide.withdraw },
    )
    const { network, transactionHash, blockNumber, transactionIndex, logIndex } = execution
    const info = { network, transactionHash, blockNumber, transactionIndex, logIndex } as ILogInfo

    for (const { to, value, index } of transfers) {
      const transfer = processor.prepareTransferData({ args: [to, value] } as any, info)
      // Always set: without it the id is the one a deposit in the same transaction gets.
      transfer.actionIndex = index
      transfer.blockTimestamp = execution.blockTimestamp
      const saved = await processor.save(transfer)
      if (!saved) throw new Error(`Unable to save Safe native withdraw: ${network} ${transactionHash} action ${index}`)
    }
  },

  /** Every execution we hold for one Safe. For the rows no event will write again. */
  async sync(network: NetworksEnum, safeAddress: HexAddress): Promise<void> {
    const executions = await Models.Transaction.find({
      network,
      daoAddress: safeAddress,
      type: ITransactionType.execution,
      safeTxHash: { $type: 'string' },
    })
    const rows = await Models.SafeTransaction.find({
      network,
      safeAddress,
      safeTxHash: { $in: executions.map(execution => execution.safeTxHash) },
    })
    const rowByHash = new Map<string, SafeTransaction>()
    for (const row of rows) rowByHash.set(row.safeTxHash, row)

    for (const execution of executions) {
      const row = rowByHash.get(execution.safeTxHash!)
      if (row) await SafeNativeTransfersModule.record(execution, row)
    }
  },

  /**
   * The calls that move native, with their position in the transaction. A delegatecall carries no
   * value, so a delegatecall counts only as a MultiSend batch, by the calls inside it.
   */
  _transfers(row: SafeTransaction): Array<{ to: string; value: string; index: number }> {
    if (row.operation === 0) {
      return BigInt(row.value ?? '0') > 0n ? [{ to: row.to, value: row.value!, index: 0 }] : []
    }
    if (row.data?.slice(0, 10).toLowerCase() !== MultiSendModule.SELECTOR) return []
    const { calls, malformed } = MultiSendModule.split(row.data)
    if (malformed) return []

    const transfers: Array<{ to: string; value: string; index: number }> = []
    for (let index = 0; index < calls.length; index++) {
      const { to, value, operation } = calls[index]
      if (operation === 0 && BigInt(value) > 0n) transfers.push({ to, value, index })
    }
    return transfers
  },
}

export default SafeNativeTransfersModule
