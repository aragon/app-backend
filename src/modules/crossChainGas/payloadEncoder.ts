/**
 * Builds the `ccipReceive` calldata that the destination CCIP Router would deliver.
 *
 * The encodings here must match byte-for-byte what the frontend encodes into the proposal, or the
 * destination `abi.decode` fails and the simulation measures nothing useful.
 */

import { CCIPAdapter } from '@artifacts/ccip'
import { type ICrossChainGasAction, type ICrossChainLane } from '@types'
import { AbiCoder, Interface, ZeroHash } from 'ethers'

const abiCoder = AbiCoder.defaultAbiCoder()
const adapterInterface = new Interface(CCIPAdapter.abi)

/** `Action[]` - the payload the destination Executor performs. */
const ACTIONS_TYPE = ['(address to,uint256 value,bytes data)[]']

/** `Transaction` from `src/lib/Transaction.sol`; `TransactionLib.encode` is a plain `abi.encode`. */
const TRANSACTION_TYPE = [
  '(uint256 nonce,address origin,address controller,uint256 originChainId,uint256 destinationChainId,bytes message)',
]

/**
 * The real nonce is `_currentTxNonce + 1` and that counter is `internal`, so it is not readable
 * off-chain. Any large constant works: the nonce only feeds the transaction id, the id only
 * selects a slot in `_transactions`, and every never-delivered id maps to a cold zero-valued slot
 * that costs the same to write. It must be *unseen* though - a previously delivered id makes
 * `receiveMessage` revert with MESSAGE_ALREADY_DELIVERED_OR_EXECUTED.
 */
export const SIMULATION_NONCE = BigInt(Number.MAX_SAFE_INTEGER)

const CrossChainPayloadEncoder = {
  /** The action array, ABI-encoded. */
  encodeMessage(actions: ICrossChainGasAction[]): string {
    return abiCoder.encode(ACTIONS_TYPE, [
      actions.map(action => [action.to, BigInt(action.value || '0'), action.data || '0x']),
    ])
  },

  /** `Transaction` struct wrapping the message. */
  encodeTransaction(params: {
    controllerAddress: string
    originChainId: number
    destinationChainId: number
    message: string
    /**
     * Whichever executor calls `forwardMessage` when the proposal runs. Like the nonce it only
     * feeds the transaction id, so it is gas-neutral; the controller itself is a fine stand-in.
     */
    origin: string
  }): string {
    return abiCoder.encode(TRANSACTION_TYPE, [
      [
        SIMULATION_NONCE,
        params.origin,
        params.controllerAddress,
        BigInt(params.originChainId),
        BigInt(params.destinationChainId),
        params.message,
      ],
    ])
  },

  /**
   * The outer `ccipReceive` call.
   *
   * `sender` is `bytes`, not `address`: CCIP supports non-EVM chains, so addresses travel
   * ABI-encoded and the adapter does `abi.decode(message.sender, (address))`. A bare 20-byte
   * value will not decode.
   */
  encodeCcipReceive(params: { controllerAddress: string; originChainSelector: bigint; encodedTx: string }): string {
    return adapterInterface.encodeFunctionData('ccipReceive', [
      [
        ZeroHash, // messageId - the adapter only re-emits it
        params.originChainSelector,
        abiCoder.encode(['address'], [params.controllerAddress]),
        params.encodedTx,
        [], // destTokenAmounts - this system never bridges tokens
      ],
    ])
  },

  /** The full origin-to-destination payload for one batch of actions. */
  buildDeliveryInput(lane: ICrossChainLane, controllerAddress: string, actions: ICrossChainGasAction[]): string {
    const message = CrossChainPayloadEncoder.encodeMessage(actions)
    const encodedTx = CrossChainPayloadEncoder.encodeTransaction({
      controllerAddress,
      originChainId: lane.originChainId,
      destinationChainId: lane.destinationChainId,
      message,
      origin: controllerAddress,
    })

    return CrossChainPayloadEncoder.encodeCcipReceive({
      controllerAddress,
      originChainSelector: lane.originChainSelector,
      encodedTx,
    })
  },
}

export default CrossChainPayloadEncoder

