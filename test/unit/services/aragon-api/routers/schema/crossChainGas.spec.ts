import CrossChainGasSchema from '@api/routers/schema/crossChainGas'
import { MAX_ACTION_CALLDATA_BYTES, MAX_ACTIONS, MAX_TOTAL_CALLDATA_BYTES } from '@modules/crossChainGas/constants'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

const CONTROLLER = '0x1111111111111111111111111111111111111111'
const TARGET = '0x4200000000000000000000000000000000000006'

const validate = (params: Record<string, any>) =>
  CrossChainGasSchema.estimateGasLimit.validate(
    {
      controllerAddress: CONTROLLER,
      network: NetworksEnum.ethereumMainnet,
      destinationChainId: 8453,
      actions: [{ to: TARGET, value: '0', data: '0x095ea7b3' }],
      ...params,
    },
    { presence: 'required' },
  )

/** `data` of exactly `bytes` bytes. */
const calldata = (bytes: number) => `0x${'ab'.repeat(bytes)}`

describe('Schema: crossChainGas', () => {
  it('accepts a well-formed request', () => {
    expect(validate({}).error).to.be.undefined
  })

  it('defaults an omitted value and data', () => {
    const { error, value } = validate({ actions: [{ to: TARGET }] })

    expect(error).to.be.undefined
    expect(value.actions[0].value).to.equal('0')
    expect(value.actions[0].data).to.equal('0x')
  })

  it('checksums the controller address', () => {
    const { error, value } = validate({ controllerAddress: CONTROLLER.toLowerCase() })

    expect(error).to.be.undefined
    expect(value.controllerAddress).to.equal(CONTROLLER)
  })

  describe('destinationChainId', () => {
    it('rejects a non-positive or fractional chain id', () => {
      expect(validate({ destinationChainId: 0 }).error).to.not.be.undefined
      expect(validate({ destinationChainId: -1 }).error).to.not.be.undefined
      expect(validate({ destinationChainId: 1.5 }).error).to.not.be.undefined
    })

    it('rejects a CCIP selector passed where a chain id belongs', () => {
      // Base's selector. Selectors are 64-bit and land outside the safe-integer range, so the
      // easiest way to get this parameter wrong is caught here rather than at the adapter.
      expect(validate({ destinationChainId: 15971525489660198786 }).error).to.not.be.undefined
    })

    it('rejects a chain id that is not in the known network map', () => {
      expect(validate({ destinationChainId: 999_999 }).error).to.not.be.undefined
    })
  })

  describe('actions', () => {
    it('rejects an empty batch', () => {
      expect(validate({ actions: [] }).error).to.not.be.undefined
    })

    it(`rejects more than ${MAX_ACTIONS} actions`, () => {
      const actions = Array.from({ length: MAX_ACTIONS + 1 }, () => ({ to: TARGET, value: '0', data: '0x' }))

      expect(validate({ actions }).error).to.not.be.undefined
    })

    it(`accepts exactly ${MAX_ACTIONS} actions`, () => {
      const actions = Array.from({ length: MAX_ACTIONS }, () => ({ to: TARGET, value: '0', data: '0x' }))

      expect(validate({ actions }).error).to.be.undefined
    })

    it('rejects a non-hex data field', () => {
      expect(validate({ actions: [{ to: TARGET, value: '0', data: 'deadbeef' }] }).error).to.not.be.undefined
      expect(validate({ actions: [{ to: TARGET, value: '0', data: '0xzz' }] }).error).to.not.be.undefined
      // Odd-length hex is not a byte string.
      expect(validate({ actions: [{ to: TARGET, value: '0', data: '0xabc' }] }).error).to.not.be.undefined
    })

    it('rejects a non-decimal value field', () => {
      expect(validate({ actions: [{ to: TARGET, value: '1.5', data: '0x' }] }).error).to.not.be.undefined
      expect(validate({ actions: [{ to: TARGET, value: '0x10', data: '0x' }] }).error).to.not.be.undefined
    })

    it('accepts the largest uint256 value and rejects overflow', () => {
      expect(validate({ actions: [{ to: TARGET, value: (2n ** 256n - 1n).toString(), data: '0x' }] }).error).to.be
        .undefined
      expect(validate({ actions: [{ to: TARGET, value: (2n ** 256n).toString(), data: '0x' }] }).error).to.not.be
        .undefined
      expect(validate({ actions: [{ to: TARGET, value: '9'.repeat(79), data: '0x' }] }).error).to.not.be.undefined
    })

    it(`caps each action's calldata at ${MAX_ACTION_CALLDATA_BYTES} bytes`, () => {
      expect(validate({ actions: [{ to: TARGET, value: '0', data: calldata(MAX_ACTION_CALLDATA_BYTES) }] }).error).to.be
        .undefined
      expect(validate({ actions: [{ to: TARGET, value: '0', data: calldata(MAX_ACTION_CALLDATA_BYTES + 1) }] }).error)
        .to.not.be.undefined
    })

    it(`caps aggregate calldata at ${MAX_TOTAL_CALLDATA_BYTES} bytes`, () => {
      const fullAction = { to: TARGET, value: '0', data: calldata(MAX_ACTION_CALLDATA_BYTES) }
      expect(validate({ actions: Array.from({ length: 4 }, () => fullAction) }).error).to.be.undefined
      expect(
        validate({
          actions: [...Array.from({ length: 4 }, () => fullAction), { to: TARGET, value: '0', data: calldata(1) }],
        }).error,
      ).to.not.be.undefined
    })

    it('rejects an invalid target address', () => {
      expect(validate({ actions: [{ to: '0x123', value: '0', data: '0x' }] }).error).to.not.be.undefined
    })
  })
})
