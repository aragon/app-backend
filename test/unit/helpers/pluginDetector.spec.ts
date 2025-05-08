import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import PluginDetector from '@helpers/pluginDetector'
import { beforeEach } from 'mocha'
import { IPluginInterfaceType, IBodyAddressType, NetworksEnum } from '@types'
import { ZeroAddress } from 'ethers'
import { expect } from 'chai'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'
import logger from '@logger'

describe.only('Helper: PluginDetector', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  const simulateBytecodeForFunctions = (functions: string[]): string => {
    // Construct a bytecode string that includes the first 10 characters of the keccak hash for each function signature
    return '0x' + functions.map(func => PluginDetector._generateFunctionHash(func)).join('')
  }

  it('should return unknown plugin for ZeroAddress', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress')
    const result = await PluginDetector.detectPluginType(ZeroAddress, NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.unknown)
    expect(result.proxy).to.be.false
    expect(result.hasTarget).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.notCalled).to.be.true
  })

  it('should detect tokenVoting plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox
        .stub()
        .resolves(
          simulateBytecodeForFunctions([...PluginDetector.TOKEN_VOTING_FUNCTIONS, ...PluginDetector.HAS_TARGET]),
        ),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.tokenVoting)
    expect(result.proxy).to.be.false
    expect(result.hasTarget).to.be.true
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect spp plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(PluginDetector.SPP_FUNCTIONS)),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.spp)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect multisig plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(PluginDetector.MULTISIG_FUNCTIONS)),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.multisig)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect admin plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(PluginDetector.ADMIN_FUNCTIONS)),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.admin)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect gauge plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(PluginDetector.GAUGE_VOTER_FUNCTIONS)),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.gauge)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should return unknown plugin when bytecode does not match any functions', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0xUnrelatedBytecodeThatDoesNotMatchAnyFunctionHashes'),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.unknown)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should get getCode from implementation address if proxy is set', async () => {
    const implementationAddress = '0xImplementation'
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(implementationAddress)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(PluginDetector.MULTISIG_FUNCTIONS)),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.multisig)
    expect(result.proxy).to.be.true
    expect(result.implementationAddress).to.equal(implementationAddress)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should handle an error when fetching bytecode', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().rejects(new Error('Failed to fetch bytecode')),
    } as any)

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.unknown)
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })

  describe('detectAddressType', () => {
    it('should return EOA for ZeroAddress', async () => {
      const result = await PluginDetector.detectAddressType(ZeroAddress, NetworksEnum.ethereumMainnet)
      expect(result).to.equal(IBodyAddressType.EOA)
    })

    it('should return EOA for address with no code', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves('0x'),
      } as any)

      const result = await PluginDetector.detectAddressType('0xAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(IBodyAddressType.EOA)
    })

    it('should return SAFE for Safe wallet contract', async () => {
      const safeWalletBytecode = '0x' + PluginDetector._generateFunctionHash(PluginDetector.SAFE_WALLET).substring(2)
      
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(safeWalletBytecode),
      } as any)

      const result = await PluginDetector.detectAddressType('0xSafeAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(IBodyAddressType.SAFE)
    })

    it('should return OTHER for contract that is not a Safe wallet', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves('0xSomeContractBytecode'),
      } as any)

      const result = await PluginDetector.detectAddressType('0xContractAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(IBodyAddressType.OTHER)
    })

    it('should handle an error when fetching code', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().rejects(new Error('Failed to fetch code')),
      } as any)

      const result = await PluginDetector.detectAddressType('0xAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(IBodyAddressType.OTHER)
    })
  })
})
