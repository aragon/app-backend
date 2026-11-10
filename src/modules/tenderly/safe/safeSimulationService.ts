/**
 * Tenderly runs of one pending Safe transaction, read from the stored queue by `safeTxHash`.
 *
 * The run calls `execTransaction` on the Safe with every field of the queued transaction, so a
 * delegate call (a MultiSend batch), the value the Safe sends, the guard and the modules all behave
 * as they would onchain. Signatures are not collected: the Safe's threshold is overridden to 1 and
 * the sender, a current owner, signs with the "approved by sender" form (`r` = owner, `s` = 0,
 * `v` = 1), which Safe accepts without a signature when `msg.sender` is that owner.
 *
 * The Safe's nonce is overridden to the transaction's own, so a transaction queued behind earlier
 * nonces still runs, and so the hash the Safe computes for the call is the transaction's own
 * `safeTxHash`. The "approved by sender" form does not depend on that hash, so the Safe would run
 * any payload: a run only counts as a success when the hash the Safe emits matches `safeTxHash`,
 * which proves the stored fields and nonce are the ones the owners are signing. Those earlier transactions are not applied first: the run sees current chain
 * state, so a transaction that depends on an earlier queued one can fail here and pass onchain.
 */

import config from '@config'
import { Models } from '@dbModels'
import * as Errors from '@errors'
import logger from '@logger'
import type SafeTransaction from '@models/schema/safeTransaction'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import TenderlyModule from '@modules/tenderly'
import {
  ErrorKeyEnum,
  getSafeShortName,
  ISafeTransactionState,
  type ISimulationResult,
  ISimulationStatus,
  type ITenderlyFullSimulationResponse,
  ITenderlyOperation,
  type ITenderlyPayload,
  type ITenderlyRequest,
} from '@types'
import {
  concat,
  dataLength,
  dataSlice,
  getAddress,
  Interface,
  id,
  toBeHex,
  ZeroAddress,
  ZeroHash,
  zeroPadValue,
} from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-simulation-service' })

/** Safe storage layout, identical from v1.0.0 to v1.4.1: `threshold` then `nonce`. */
const THRESHOLD_SLOT = zeroPadValue(toBeHex(4), 32)
const NONCE_SLOT = zeroPadValue(toBeHex(5), 32)

/**
 * Same argument types from v1.1.0 on, so one topic covers every version. `txHash` is indexed
 * (topic 1) in newer versions and the first data word in older ones.
 */
const EXECUTION_FAILURE_TOPIC = id('ExecutionFailure(bytes32,uint256)')
const EXECUTION_SUCCESS_TOPIC = id('ExecutionSuccess(bytes32,uint256)')

const safeInterface = new Interface([
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)',
])

export type ISafeSimulationInput = Pick<
  SafeTransaction,
  | 'id'
  | 'network'
  | 'safeAddress'
  | 'safeTxHash'
  | 'nonce'
  | 'to'
  | 'value'
  | 'data'
  | 'operation'
  | 'safeTxGas'
  | 'baseGas'
  | 'gasPrice'
  | 'gasToken'
  | 'refundReceiver'
  | 'from'
  | 'simulation'
>

const SafeSimulationService = {
  /** The stored pending transaction. A Safe on a chain the Safe service does not serve is a bad request. */
  async load(request: ITenderlyRequest<ITenderlyOperation.safeTransaction>): Promise<ISafeSimulationInput> {
    Errors.assertExposable(
      !!getSafeShortName(request.network),
      ErrorKeyEnum.badSimulationRequest,
      400,
      'Safe transactions are not supported on this network',
    )

    const transaction = await Models.SafeTransaction.findOne({
      network: request.network,
      safeAddress: getAddress(request.safeAddress),
      safeTxHash: request.safeTxHash.toLowerCase(),
    }).lean()

    Errors.assertExposable(
      transaction?.state === ISafeTransactionState.live,
      ErrorKeyEnum.notFound,
      404,
      'Pending Safe transaction not found',
    )

    return transaction!
  },

  /** The stored run when it is younger than the re-simulation window, so a repeat inside it costs nothing. */
  recent(transaction: ISafeSimulationInput): ISimulationResult | null {
    const simulation = transaction.simulation
    if (
      !simulation?.status ||
      !simulation.runAt ||
      !simulation.url ||
      simulation.runAt + config.TENDERLY.RE_SIMULATION_TIME <= Date.now()
    ) {
      return null
    }

    return { status: simulation.status, url: simulation.url, runAt: simulation.runAt, network: transaction.network }
  },

  /**
   * The `execTransaction` call and the state it runs against. Sent from the proposer when it is still
   * an owner, otherwise from the first owner. The top-level value is 0: the transaction's own value
   * leaves the Safe's balance, exactly as it would onchain.
   */
  async build(transaction: ISafeSimulationInput) {
    const safeAddress = getAddress(transaction.safeAddress)
    const owners = await SafeChainReaderModule.readOwners(transaction.network, safeAddress)

    Errors.assertExposable(!!owners?.length, ErrorKeyEnum.badSimulationRequest, 400, 'Invalid Safe: no owners')

    const proposer = transaction.from ? getAddress(transaction.from) : null
    const from = proposer && owners!.includes(proposer) ? proposer : owners![0]

    const signature = concat([zeroPadValue(from, 32), ZeroHash, '0x01'])
    const data = safeInterface.encodeFunctionData('execTransaction', [
      transaction.to,
      transaction.value ?? '0',
      transaction.data ?? '0x',
      transaction.operation ?? 0,
      transaction.safeTxGas ?? '0',
      transaction.baseGas ?? '0',
      transaction.gasPrice ?? '0',
      transaction.gasToken ?? ZeroAddress,
      transaction.refundReceiver ?? ZeroAddress,
      signature,
    ])
    const stateObjects: ITenderlyPayload['state_objects'] = {
      [safeAddress]: {
        storage: {
          [THRESHOLD_SLOT]: zeroPadValue(toBeHex(1), 32),
          [NONCE_SLOT]: zeroPadValue(toBeHex(BigInt(transaction.nonce)), 32),
        },
      },
    }

    return { to: safeAddress, from, value: '0', data, stateObjects }
  },

  /**
   * With a non-zero `safeTxGas` or `gasPrice`, Safe catches a failed inner call: `execTransaction`
   * succeeds, emits `ExecutionFailure` and returns false. That is a failed transaction all the same.
   */
  innerCallFailed(response: ITenderlyFullSimulationResponse, safeAddress: string): boolean {
    const info = response.transaction?.transaction_info
    const safe = safeAddress.toLowerCase()
    const failureLogged = (info?.logs ?? []).some(
      log =>
        log.raw?.address?.toLowerCase() === safe && log.raw?.topics?.[0]?.toLowerCase() === EXECUTION_FAILURE_TOPIC,
    )

    return failureLogged || info?.call_trace?.output === ZeroHash
  },

  /**
   * The `txHash` of the outermost `execTransaction` the Safe ran: its last execution log, since a
   * nested call into the Safe emits before the outer one finishes. `null` when there is none.
   */
  executedHash(response: ITenderlyFullSimulationResponse, safeAddress: string): string | null {
    const safe = safeAddress.toLowerCase()
    const logs = (response.transaction?.transaction_info?.logs ?? []).filter(log => {
      const topic = log.raw?.topics?.[0]?.toLowerCase()
      return (
        log.raw?.address?.toLowerCase() === safe &&
        (topic === EXECUTION_SUCCESS_TOPIC || topic === EXECUTION_FAILURE_TOPIC)
      )
    })
    const raw = logs[logs.length - 1]?.raw
    if (!raw) return null

    const indexed = raw.topics?.[1]
    if (indexed) return indexed.toLowerCase()
    return raw.data && dataLength(raw.data) >= 32 ? dataSlice(raw.data, 0, 32).toLowerCase() : null
  },

  /**
   * Failed when the run reverted or the Safe caught a failed inner call. A run that went through
   * but executed a payload other than `safeTxHash` names (or emitted no hash at all) is failed too:
   * it does not show what the owners are signing.
   */
  status(
    response: ITenderlyFullSimulationResponse,
    status: ISimulationStatus,
    transaction: Pick<ISafeSimulationInput, 'network' | 'safeAddress' | 'safeTxHash'>,
  ): ISimulationStatus {
    const safeAddress = transaction.safeAddress
    if (status === ISimulationStatus.FAILED || SafeSimulationService.innerCallFailed(response, safeAddress)) {
      return ISimulationStatus.FAILED
    }

    const executed = SafeSimulationService.executedHash(response, safeAddress)
    if (executed !== transaction.safeTxHash.toLowerCase()) {
      logger.error(
        'Tenderly: Safe executed a different transaction than its safeTxHash, run marked failed',
        llo({ network: transaction.network, safeAddress, safeTxHash: transaction.safeTxHash, executed }),
      )
      return ISimulationStatus.FAILED
    }

    return ISimulationStatus.SUCCESS
  },

  /**
   * One paid run. The budget is charged to the Safe, never to the owner it is sent from. A full run,
   * so the logs the hash check reads are always returned.
   */
  async simulate(transaction: ISafeSimulationInput, deadlineAt: number): Promise<ISimulationResult> {
    const simulation = await SafeSimulationService.build(transaction)
    const { response, shareUrl, runAt, status } = await TenderlyModule._payload(
      simulation,
      transaction.network,
      {
        operation: ITenderlyOperation.safeTransaction,
        network: transaction.network,
        safeAddress: simulation.to,
        deadlineAt,
      },
      true,
    )

    return {
      status: SafeSimulationService.status(response, status, transaction),
      url: shareUrl,
      runAt,
      network: transaction.network,
    }
  },

  /**
   * Kept on the row for the GET route. One document, so the update is atomic on its own; the
   * `runAt` guard keeps a slower concurrent run from overwriting a newer one. The run is already
   * paid for, so a failed write is only logged.
   */
  async save(transactionId: string, result: ISimulationResult): Promise<void> {
    try {
      await Models.SafeTransaction.updateOne(
        { id: transactionId, $or: [{ 'simulation.runAt': null }, { 'simulation.runAt': { $lt: result.runAt } }] },
        { $set: { simulation: { url: result.url, status: result.status, runAt: result.runAt } } },
      )
    } catch (error) {
      logger.warn('Tenderly: Safe transaction simulation could not be stored', llo({ transactionId, error }))
    }
  },
}

export default SafeSimulationService
