import { Models } from '@dbModels'
import ContractHelper from '@helpers/contractHelper'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { keccak256 } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: ContractHelper', () => {
  let sandbox: SinonSandbox
  const testAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  const testNetwork = NetworksEnum.ethereumMainnet
  const testBytecode = '0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe'

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getBytecode', () => {
    it('should return cached bytecode from DB when available', async () => {
      const getBytecodeStub = sandbox.stub(Models.Contract, 'getBytecode').resolves(testBytecode)
      const getAnyRpcProviderStub = sandbox.stub(ProviderModule, 'getAnyRpcProvider')

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.equal(testBytecode)
      expect(getBytecodeStub.calledOnceWith(testAddress, testNetwork)).to.be.true
      expect(getAnyRpcProviderStub.called).to.be.false
    })

    it('should fetch from chain and store in DB when not cached', async () => {
      const getBytecodeStub = sandbox.stub(Models.Contract, 'getBytecode').resolves(null)
      const createStub = sandbox.stub(Models.Contract, 'create').resolves({} as any)
      const getCodeStub = sandbox.stub().resolves(testBytecode)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: getCodeStub,
      } as any)

      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
        schedule: (fn: () => Promise<string>) => fn(),
      } as any)

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.equal(testBytecode)
      expect(getBytecodeStub.calledOnceWith(testAddress, testNetwork)).to.be.true
      expect(getCodeStub.calledOnceWith(testAddress)).to.be.true
      expect(createStub.calledOnce).to.be.true
      expect(createStub.firstCall.args[0]).to.deep.equal({
        address: testAddress,
        network: testNetwork,
        bytecode: testBytecode,
        bytecodeHash: keccak256(testBytecode),
      })
    })

    it('should return null and not store when bytecode is empty', async () => {
      sandbox.stub(Models.Contract, 'getBytecode').resolves(null)
      const createStub = sandbox.stub(Models.Contract, 'create')
      const getCodeStub = sandbox.stub().resolves('0x')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: getCodeStub,
      } as any)

      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
        schedule: (fn: () => Promise<string>) => fn(),
      } as any)

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.be.null
      expect(createStub.called).to.be.false
    })

    it('should return null and not store when bytecode is null', async () => {
      sandbox.stub(Models.Contract, 'getBytecode').resolves(null)
      const createStub = sandbox.stub(Models.Contract, 'create')
      const getCodeStub = sandbox.stub().resolves(null)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: getCodeStub,
      } as any)

      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
        schedule: (fn: () => Promise<string>) => fn(),
      } as any)

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.be.null
      expect(createStub.called).to.be.false
    })

    it('should use rate limiter when fetching from chain', async () => {
      sandbox.stub(Models.Contract, 'getBytecode').resolves(null)
      sandbox.stub(Models.Contract, 'create').resolves({} as any)
      const getCodeStub = sandbox.stub().resolves(testBytecode)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: getCodeStub,
      } as any)

      const scheduleStub = sandbox.stub().callsFake((fn: () => Promise<string>) => fn())
      const getNodeLimiterStub = sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
        schedule: scheduleStub,
      } as any)

      await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(getNodeLimiterStub.calledOnceWith(testNetwork)).to.be.true
      expect(scheduleStub.calledOnce).to.be.true
    })

    it('should not call provider when bytecode is already in DB (cache hit scenario)', async () => {
      const cachedBytecode = '0xcachedBytecode123456789'
      const getBytecodeStub = sandbox.stub(Models.Contract, 'getBytecode').resolves(cachedBytecode)
      const getAnyRpcProviderStub = sandbox.stub(ProviderModule, 'getAnyRpcProvider')
      const getNodeLimiterStub = sandbox.stub(BottleneckModule, 'getNodeLimiter')

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.equal(cachedBytecode)
      expect(getBytecodeStub.calledOnce).to.be.true
      expect(getAnyRpcProviderStub.called).to.be.false
      expect(getNodeLimiterStub.called).to.be.false
    })

    it('should treat cached 0x as cache miss and fetch from chain', async () => {
      // This handles the case where getSourceCode wrote fake '0x' bytecode
      const getBytecodeStub = sandbox.stub(Models.Contract, 'getBytecode').resolves('0x')
      const createStub = sandbox.stub(Models.Contract, 'create').resolves({} as any)
      const getCodeStub = sandbox.stub().resolves(testBytecode)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: getCodeStub,
      } as any)

      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
        schedule: (fn: () => Promise<string>) => fn(),
      } as any)

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.equal(testBytecode)
      expect(getBytecodeStub.calledOnceWith(testAddress, testNetwork)).to.be.true
      expect(getCodeStub.calledOnceWith(testAddress)).to.be.true
      expect(createStub.calledOnce).to.be.true
    })

    it('should return null when cached 0x and chain also returns 0x', async () => {
      sandbox.stub(Models.Contract, 'getBytecode').resolves('0x')
      const createStub = sandbox.stub(Models.Contract, 'create')
      const getCodeStub = sandbox.stub().resolves('0x')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: getCodeStub,
      } as any)

      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
        schedule: (fn: () => Promise<string>) => fn(),
      } as any)

      const result = await ContractHelper.getBytecode(testAddress, testNetwork)

      expect(result).to.be.null
      expect(createStub.called).to.be.false
    })
  })

  describe('getSourceCode', () => {
    const testSourceCode = 'pragma solidity ^0.8.0; contract Test {}'
    const testAbi = '[{"type":"function","name":"test"}]'
    const testContractName = 'TestContract'
    const testCompilerVersion = 'v0.8.17+commit.8df45f5f'

    it('should return cached source code from DB when available', async () => {
      const findOneStub = sandbox.stub(Models.Contract, 'findOne').resolves({
        sourceCode: testSourceCode,
        abi: testAbi,
        contractName: testContractName,
        compilerVersion: testCompilerVersion,
      } as any)
      const fetchContractSourceCodeStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode')

      const result = await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(result).to.deep.equal([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])
      expect(findOneStub.calledOnceWith({ address: testAddress, network: testNetwork })).to.be.true
      expect(fetchContractSourceCodeStub.called).to.be.false
    })

    it('should fetch from API and store in DB when not cached', async () => {
      const findOneStub = sandbox.stub(Models.Contract, 'findOne').resolves(null)
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate').resolves({} as any)
      const fetchContractSourceCodeStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])

      const result = await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(result).to.deep.equal([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])
      expect(findOneStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.calledOnceWith({ address: testAddress, network: testNetwork })).to.be.true
      expect(findOneAndUpdateStub.calledOnce).to.be.true
      expect(findOneAndUpdateStub.firstCall.args[1].compilerVersion).to.equal(testCompilerVersion)
    })

    it('should return null when API returns empty data', async () => {
      sandbox.stub(Models.Contract, 'findOne').resolves(null)
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate')
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves(null)

      const result = await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(result).to.be.null
      expect(findOneAndUpdateStub.called).to.be.false
    })

    it('should return null when API returns data without ABI', async () => {
      sandbox.stub(Models.Contract, 'findOne').resolves(null)
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate')
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          SourceCode: testSourceCode,
          ABI: '',
          ContractName: testContractName,
        },
      ])

      const result = await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(result).to.be.null
      expect(findOneAndUpdateStub.called).to.be.false
    })

    it('should not call API when source code is already in DB (cache hit scenario)', async () => {
      const findOneStub = sandbox.stub(Models.Contract, 'findOne').resolves({
        sourceCode: testSourceCode,
        abi: testAbi,
        contractName: testContractName,
        compilerVersion: testCompilerVersion,
      } as any)
      const fetchContractSourceCodeStub = sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode')
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate')

      const result = await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(result).to.deep.equal([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])
      expect(findOneStub.calledOnce).to.be.true
      expect(fetchContractSourceCodeStub.called).to.be.false
      expect(findOneAndUpdateStub.called).to.be.false
    })

    it('should handle missing compilerVersion gracefully', async () => {
      const findOneStub = sandbox.stub(Models.Contract, 'findOne').resolves({
        sourceCode: testSourceCode,
        abi: testAbi,
        contractName: testContractName,
        compilerVersion: null,
      } as any)

      const result = await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(result).to.deep.equal([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: '',
        },
      ])
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should not write fake bytecode when no cached record exists', async () => {
      sandbox.stub(Models.Contract, 'findOne').resolves(null)
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate').resolves({} as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])

      await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(findOneAndUpdateStub.calledOnce).to.be.true
      const updateData = findOneAndUpdateStub.firstCall.args[1]
      expect(updateData.bytecode).to.be.undefined
      expect(updateData.bytecodeHash).to.be.undefined
    })

    it('should not write fake bytecode when cached record has 0x bytecode', async () => {
      sandbox.stub(Models.Contract, 'findOne').resolves({
        bytecode: '0x',
        bytecodeHash: keccak256('0x'),
      } as any)
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate').resolves({} as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])

      await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(findOneAndUpdateStub.calledOnce).to.be.true
      const updateData = findOneAndUpdateStub.firstCall.args[1]
      expect(updateData.bytecode).to.be.undefined
      expect(updateData.bytecodeHash).to.be.undefined
    })

    it('should preserve existing meaningful bytecode when updating', async () => {
      const existingBytecode = '0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe'
      const existingBytecodeHash = keccak256(existingBytecode)
      sandbox.stub(Models.Contract, 'findOne').resolves({
        bytecode: existingBytecode,
        bytecodeHash: existingBytecodeHash,
      } as any)
      const findOneAndUpdateStub = sandbox.stub(Models.Contract, 'findOneAndUpdate').resolves({} as any)
      sandbox.stub(ProxyWeb3Provider, 'fetchContractSourceCode').resolves([
        {
          SourceCode: testSourceCode,
          ABI: testAbi,
          ContractName: testContractName,
          CompilerVersion: testCompilerVersion,
        },
      ])

      await ContractHelper.getSourceCode(testAddress, testNetwork)

      expect(findOneAndUpdateStub.calledOnce).to.be.true
      const updateData = findOneAndUpdateStub.firstCall.args[1]
      expect(updateData.bytecode).to.equal(existingBytecode)
      expect(updateData.bytecodeHash).to.equal(existingBytecodeHash)
    })
  })
})
