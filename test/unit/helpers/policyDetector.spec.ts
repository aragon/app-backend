import PolicyDetector from '@helpers/policyDetector'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import { IPolicyModelType, IPolicySourceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: PolicyDetector', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  const simulateBytecodeForFunctions = (functions: string[]): string => {
    return '0x' + functions.map(fn => PolicyDetector._generateFunctionHash(fn).replace('0x', '')).join('')
  }

  describe('_generateFunctionHash', () => {
    it('should generate correct keccak256 hash for function signature', () => {
      const hash = PolicyDetector._generateFunctionHash('token()')
      expect(hash).to.be.a('string')
      expect(hash.startsWith('0x')).to.be.true
      expect(hash.length).to.eq(10) // 0x + 8 chars
    })

    it('should generate different hashes for different signatures', () => {
      const hash1 = PolicyDetector._generateFunctionHash('token()')
      const hash2 = PolicyDetector._generateFunctionHash('vault()')
      expect(hash1).to.not.eq(hash2)
    })
  })

  describe('_hasFunction', () => {
    it('should return true if bytecode contains function hash', () => {
      const bytecode = simulateBytecodeForFunctions(['token()', 'vault()'])
      const result = PolicyDetector._hasFunction(bytecode, 'token()')
      expect(result).to.be.true
    })

    it('should return false if bytecode does not contain function hash', () => {
      const bytecode = simulateBytecodeForFunctions(['token()'])
      const result = PolicyDetector._hasFunction(bytecode, 'vault()')
      expect(result).to.be.false
    })
  })

  describe('_hasFunctions', () => {
    it('should return true if bytecode contains all functions', () => {
      const bytecode = simulateBytecodeForFunctions(['token()', 'vault()', 'sourceBalance()'])
      const result = PolicyDetector._hasFunctions(bytecode, ['token()', 'vault()'])
      expect(result).to.be.true
    })

    it('should return false if bytecode missing any function', () => {
      const bytecode = simulateBytecodeForFunctions(['token()'])
      const result = PolicyDetector._hasFunctions(bytecode, ['token()', 'vault()'])
      expect(result).to.be.false
    })
  })

  describe('detectSourceType', () => {
    it('should detect streamBalance source type', async () => {
      const streamFunctions = ['token()', 'sourceBalance()', 'writeCheckpoint()', 'setPlugin(address)']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(streamFunctions)),
      } as any)

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicySourceType.streamBalance)
    })

    it('should detect required source type', async () => {
      const requiredFunctions = ['requiredBalance()']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(requiredFunctions)),
      } as any)

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicySourceType.required)
    })

    it('should detect fixed source type', async () => {
      const fixedFunctions = ['targetAmount()']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(fixedFunctions)),
      } as any)

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicySourceType.fixed)
    })

    it('should detect drain source type', async () => {
      const drainFunctions = ['vault()', 'token()']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(drainFunctions)),
      } as any)

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicySourceType.drain)
    })

    it('should return null for empty bytecode', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves('0x'),
      } as any)

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })

    it('should return null for unknown source type', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(['unknownFunction()'])),
      } as any)

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })

    it('should return null and log error on exception', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().rejects(new Error('Provider error')),
      } as any)
      const errorStub = sandbox.stub(logger, 'error')

      const result = await PolicyDetector.detectSourceType('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('detectModelType', () => {
    it('should detect addressGauge model type', async () => {
      const gaugeFunctions = ['gaugeVoter()']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(gaugeFunctions)),
      } as any)

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicyModelType.addressGauge)
    })

    it('should detect brackets model type', async () => {
      const bracketsFunctions = ['brackets(uint256)']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(bracketsFunctions)),
      } as any)

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicyModelType.brackets)
    })

    it('should detect ratio model type', async () => {
      const ratioFunctions = ['recipients(uint256)', 'ratios(uint256)']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ratioFunctions)),
      } as any)

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicyModelType.ratio)
    })

    it('should detect equalRatio model type', async () => {
      const equalRatioFunctions = ['recipients(uint256)']
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(equalRatioFunctions)),
      } as any)

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq(IPolicyModelType.equalRatio)
    })

    it('should return null for empty bytecode', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves('0x'),
      } as any)

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })

    it('should return null for unknown model type', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(['unknownFunction()'])),
      } as any)

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })

    it('should return null and log error on exception', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().rejects(new Error('Provider error')),
      } as any)
      const errorStub = sandbox.stub(logger, 'error')

      const result = await PolicyDetector.detectModelType('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(errorStub.calledOnce).to.be.true
    })
  })
})
