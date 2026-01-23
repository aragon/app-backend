import BytecodeHelper from '@helpers/bytecodeHelper'
import PluginDetector from '@helpers/pluginDetector'
import ProxyContractHelper from '@helpers/proxyContract'
import { IPluginInterfaceType, NetworksEnum, VotingBodyBrandIdentity } from '@types'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: PluginDetector', () => {
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
    sandbox
      .stub(BytecodeHelper, 'getBytecode')
      .resolves(simulateBytecodeForFunctions([...PluginDetector.TOKEN_VOTING_FUNCTIONS, ...PluginDetector.HAS_TARGET]))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.tokenVoting)
    expect(result.proxy).to.be.false
    expect(result.hasTarget).to.be.true
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect spp plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(BytecodeHelper, 'getBytecode').resolves(simulateBytecodeForFunctions(PluginDetector.SPP_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.spp)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect multisig plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox
      .stub(BytecodeHelper, 'getBytecode')
      .resolves(simulateBytecodeForFunctions(PluginDetector.MULTISIG_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.multisig)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect admin plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(BytecodeHelper, 'getBytecode').resolves(simulateBytecodeForFunctions(PluginDetector.ADMIN_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.admin)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect gauge plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox
      .stub(BytecodeHelper, 'getBytecode')
      .resolves(simulateBytecodeForFunctions(PluginDetector.GAUGE_VOTER_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.gauge)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect lockToVote plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox
      .stub(BytecodeHelper, 'getBytecode')
      .resolves(simulateBytecodeForFunctions(PluginDetector.LOCK_TO_VOTE_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.lockToVote)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect capitalDistributor plugin', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox
      .stub(BytecodeHelper, 'getBytecode')
      .resolves(simulateBytecodeForFunctions(PluginDetector.CAPITAL_DISTRIBUTION_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.capitalDistributor)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should return unknown plugin when bytecode does not match any functions', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(BytecodeHelper, 'getBytecode').resolves('0xUnrelatedBytecodeThatDoesNotMatchAnyFunctionHashes')

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
    sandbox
      .stub(BytecodeHelper, 'getBytecode')
      .resolves(simulateBytecodeForFunctions(PluginDetector.MULTISIG_FUNCTIONS))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.multisig)
    expect(result.proxy).to.be.true
    expect(result.implementationAddress).to.equal(implementationAddress)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should handle an error when fetching bytecode', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(BytecodeHelper, 'getBytecode').rejects(new Error('Failed to fetch bytecode'))

    const result = await PluginDetector.detectPluginType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(IPluginInterfaceType.unknown)
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })

  describe('detectAddressType', () => {
    it('should return EOA for ZeroAddress', async () => {
      const result = await PluginDetector.detectAddressType(ZeroAddress, NetworksEnum.ethereumMainnet)
      expect(result).to.equal(VotingBodyBrandIdentity.EOA)
    })

    it('should return EOA for address with no code', async () => {
      sandbox.stub(BytecodeHelper, 'getBytecode').resolves(null)

      const result = await PluginDetector.detectAddressType('0xAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(VotingBodyBrandIdentity.EOA)
    })

    it('should return SAFE for Safe wallet contract', async () => {
      const safeWalletBytecode = '0x' + PluginDetector._generateFunctionHash(PluginDetector.SAFE_WALLET).substring(2)

      sandbox.stub(BytecodeHelper, 'getBytecode').resolves(safeWalletBytecode)

      const result = await PluginDetector.detectAddressType('0xSafeAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(VotingBodyBrandIdentity.SAFE)
    })

    it('should return OTHER for contract that is not a Safe wallet', async () => {
      sandbox.stub(BytecodeHelper, 'getBytecode').resolves('0xSomeContractBytecode')

      const result = await PluginDetector.detectAddressType('0xContractAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(VotingBodyBrandIdentity.OTHER)
    })

    it('should handle an error when fetching code', async () => {
      sandbox.stub(BytecodeHelper, 'getBytecode').rejects(new Error('Failed to fetch code'))

      const result = await PluginDetector.detectAddressType('0xAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(VotingBodyBrandIdentity.OTHER)
    })
  })
})
