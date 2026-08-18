import { CCIPAdapter } from '@artifacts/ccip'
import CrossChainPayloadEncoder, { SIMULATION_NONCE } from '@modules/crossChainGas/payloadEncoder'
import { type ICrossChainLane, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, Interface, ZeroHash } from 'ethers'

const abiCoder = AbiCoder.defaultAbiCoder()
const adapterInterface = new Interface(CCIPAdapter.abi)

const CONTROLLER = '0x1111111111111111111111111111111111111111'
const TARGET = '0x7777777777777777777777777777777777777777'

const lane: ICrossChainLane = {
  originChainId: 1,
  destinationChainId: 8453,
  destinationNetwork: NetworksEnum.baseMainnet,
  localAdapter: '0x3333333333333333333333333333333333333333',
  remoteAdapter: '0x2222222222222222222222222222222222222222',
  ccipRouter: '0x5555555555555555555555555555555555555555',
  destinationController: '0x4444444444444444444444444444444444444444',
  originChainSelector: 5009297550715157269n,
  minFailedMessageGas: 45_000n,
}

describe('Module: crossChainGas/payloadEncoder', () => {
  describe('encodeMessage', () => {
    it('encodes the action array so the destination abi.decode round-trips', () => {
      const actions = [
        { to: TARGET, value: '0', data: '0x095ea7b3' },
        { to: CONTROLLER, value: '1000', data: '0x' },
      ]

      const message = CrossChainPayloadEncoder.encodeMessage(actions)
      const [decoded] = abiCoder.decode(['(address to,uint256 value,bytes data)[]'], message)

      expect(decoded.length).to.equal(2)
      expect(decoded[0].to).to.equal(TARGET)
      expect(decoded[0].value).to.equal(0n)
      expect(decoded[0].data).to.equal('0x095ea7b3')
      expect(decoded[1].value).to.equal(1000n)
      expect(decoded[1].data).to.equal('0x')
    })

    it('defaults an empty value and empty calldata', () => {
      const message = CrossChainPayloadEncoder.encodeMessage([{ to: TARGET, value: '', data: '' }])
      const [decoded] = abiCoder.decode(['(address to,uint256 value,bytes data)[]'], message)

      expect(decoded[0].value).to.equal(0n)
      expect(decoded[0].data).to.equal('0x')
    })
  })

  describe('encodeTransaction', () => {
    it('encodes the Transaction struct as a single dynamic tuple', () => {
      const message = CrossChainPayloadEncoder.encodeMessage([{ to: TARGET, value: '0', data: '0x' }])
      const encodedTx = CrossChainPayloadEncoder.encodeTransaction({
        controllerAddress: CONTROLLER,
        originChainId: 1,
        destinationChainId: 8453,
        message,
        origin: CONTROLLER,
      })

      const [decoded] = abiCoder.decode(
        [
          '(uint256 nonce,address origin,address controller,uint256 originChainId,uint256 destinationChainId,bytes message)',
        ],
        encodedTx,
      )

      expect(decoded.nonce).to.equal(SIMULATION_NONCE)
      expect(decoded.controller).to.equal(CONTROLLER)
      expect(decoded.originChainId).to.equal(1n)
      expect(decoded.destinationChainId).to.equal(8453n)
      expect(decoded.message).to.equal(message)
    })

    it('uses a nonce large enough to be an unseen transaction id', () => {
      // A previously delivered id makes receiveMessage revert with
      // MESSAGE_ALREADY_DELIVERED_OR_EXECUTED, so the constant must sit far above any real counter.
      expect(SIMULATION_NONCE).to.equal(9007199254740991n)
    })
  })

  describe('buildDeliveryInput', () => {
    it('produces a ccipReceive call the adapter can decode', () => {
      const actions = [{ to: TARGET, value: '0', data: '0x095ea7b3' }]
      const input = CrossChainPayloadEncoder.buildDeliveryInput(lane, CONTROLLER, actions)

      expect(input.slice(0, 10)).to.equal('0x85572ffb')

      const decoded = adapterInterface.decodeFunctionData('ccipReceive', input)[0]

      expect(decoded.messageId).to.equal(ZeroHash)
      expect(decoded.sourceChainSelector).to.equal(lane.originChainSelector)
      expect(decoded.destTokenAmounts.length).to.equal(0)
    })

    it('ABI-encodes the sender rather than passing a bare 20-byte address', () => {
      // CCIP supports non-EVM chains, so the adapter does abi.decode(message.sender, (address)).
      const input = CrossChainPayloadEncoder.buildDeliveryInput(lane, CONTROLLER, [
        { to: TARGET, value: '0', data: '0x' },
      ])
      const decoded = adapterInterface.decodeFunctionData('ccipReceive', input)[0]

      expect(decoded.sender.length).to.equal(66) // 0x + 32 bytes
      expect(abiCoder.decode(['address'], decoded.sender)[0]).to.equal(CONTROLLER)
    })

    it('carries the actions all the way through the Transaction wrapper', () => {
      const actions = [{ to: TARGET, value: '5', data: '0xabcdef' }]
      const input = CrossChainPayloadEncoder.buildDeliveryInput(lane, CONTROLLER, actions)

      const decoded = adapterInterface.decodeFunctionData('ccipReceive', input)[0]
      const [transaction] = abiCoder.decode(
        [
          '(uint256 nonce,address origin,address controller,uint256 originChainId,uint256 destinationChainId,bytes message)',
        ],
        decoded.data,
      )
      const [innerActions] = abiCoder.decode(['(address to,uint256 value,bytes data)[]'], transaction.message)

      expect(transaction.originChainId).to.equal(1n)
      expect(transaction.destinationChainId).to.equal(8453n)
      expect(innerActions[0].to).to.equal(TARGET)
      expect(innerActions[0].value).to.equal(5n)
      expect(innerActions[0].data).to.equal('0xabcdef')
    })
  })
})
