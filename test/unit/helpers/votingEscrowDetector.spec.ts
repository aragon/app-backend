import ProxyContractHelper from '@helpers/proxyContract'
import VotingEscrowDetector from '@helpers/votingEscrowDetector'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: VotingEscrowDetector', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  const simulateBytecodeForFunctions = (functions: string[]): string => {
    // Construct a bytecode string that includes the first 10 characters of the keccak hash for each function signature
    return '0x' + functions.map(func => VotingEscrowDetector._generateFunctionHash(func)).join('')
  }

  it('should return false status for ZeroAddress', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress')
    const result = await VotingEscrowDetector.isVotingEscrow(ZeroAddress, NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.false
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.notCalled).to.be.true
  })

  it('should detect voting escrow contract with all required functions', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(VotingEscrowDetector.VOTING_ESCROW_FUNCTIONS)),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.true
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should return false status when contract has only partial voting escrow functions', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    const partialFunctions = ['createLock(uint256)', 'curve()', 'lockNFT()'] // Missing some required functions

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(partialFunctions)),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.false
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should return false status when bytecode does not match any voting escrow functions', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0xUnrelatedBytecodeThatDoesNotMatchAnyFunctionHashes'),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.false
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should return false status when contract has no bytecode', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0x'),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.false
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })

  it('should detect voting escrow from implementation address if proxy is set', async () => {
    const implementationAddress = '0xImplementation'
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(implementationAddress)

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(VotingEscrowDetector.VOTING_ESCROW_FUNCTIONS)),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xProxyAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.true
    expect(result.proxy).to.be.true
    expect(result.implementationAddress).to.equal(implementationAddress)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xProxyAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should handle an error when fetching bytecode', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().rejects(new Error('Failed to fetch bytecode')),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.false
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })

  it('should handle proxy contract that returns to zero address', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(VotingEscrowDetector.VOTING_ESCROW_FUNCTIONS)),
    } as any)

    const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.status).to.be.true
    expect(result.proxy).to.be.false
    expect(result.implementationAddress).to.be.null
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })

  it('should test all individual voting escrow functions', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)

    // Test each function individually to ensure they're all required
    const votingEscrowFunctions = [
      'createLock(uint256)',
      'curve()',
      'lockNFT()',
      'queue()',
      'setVoter(address)',
      'totalVotingPower()',
      'totalVotingPowerAt(uint256)',
      'votingPowerAt(uint256,uint256)',
      'withdraw(uint256)',
    ]

    for (let i = 0; i < votingEscrowFunctions.length; i++) {
      // Create bytecode missing one function
      const incompleteFunctions = votingEscrowFunctions.filter((_, index) => index !== i)

      sandbox.restore()
      sandbox = sinon.createSandbox()
      sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(incompleteFunctions)),
      } as any)

      const result = await VotingEscrowDetector.isVotingEscrow('0xAddress', NetworksEnum.ethereumMainnet)

      expect(result.status).to.be.false
    }
  })

  describe('_generateFunctionHash', () => {
    it('should generate correct function hash', () => {
      const functionSignature = 'createLock(uint256)'
      const hash = VotingEscrowDetector._generateFunctionHash(functionSignature)

      expect(hash).to.be.a('string')
      expect(hash).to.have.length(10) // 0x + 8 hex characters
      expect(hash.startsWith('0x')).to.be.true
    })

    it('should generate different hashes for different function signatures', () => {
      const hash1 = VotingEscrowDetector._generateFunctionHash('createLock(uint256)')
      const hash2 = VotingEscrowDetector._generateFunctionHash('curve()')

      expect(hash1).to.not.equal(hash2)
    })

    it('should generate consistent hashes for the same function signature', () => {
      const hash1 = VotingEscrowDetector._generateFunctionHash('totalVotingPower()')
      const hash2 = VotingEscrowDetector._generateFunctionHash('totalVotingPower()')

      expect(hash1).to.equal(hash2)
    })
  })
})
