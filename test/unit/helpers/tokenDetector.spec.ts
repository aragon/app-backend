import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenDetector, {
  ERC1155_FUNCTIONS,
  ERC20_FUNCTIONS,
  ERC721_FUNCTIONS,
  ERC777_FUNCTIONS,
  GOVERNANCE_ERC20_FUNCTIONS,
  HAS_UNDERLYING,
} from '@helpers/tokenDetector'
import { beforeEach } from 'mocha'
import { ITokenType, NetworksEnum } from '@types'
import { ZeroAddress } from 'ethers'
import { expect } from 'chai'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'
import utils from '@helpers/utils'

describe('Helper: TokenDetector', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  const simulateBytecodeForFunctions = (functions: string[]) => {
    // Construct a bytecode string that includes the first 10 characters of the Keccak hash for each function
    return '0x' + functions.map(func => TokenDetector.functionHashes[func]).join('')
  }

  it('should detect native token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress')

    const result = await TokenDetector.detectTokenType(ZeroAddress, NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.native)
    expect(result.isGovernance).to.be.false
    expect(getImplementationAddressStub.notCalled).to.be.true
  })

  it('should detect ERC20 token', async () => {
    const contractAddress = '0x0001'
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(contractAddress)

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC20_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.ERC20)
    expect(result.isGovernance).to.be.false
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect ERC20 Governance token and underlying', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox
        .stub()
        .resolves(simulateBytecodeForFunctions([...ERC20_FUNCTIONS, ...GOVERNANCE_ERC20_FUNCTIONS, ...HAS_UNDERLYING])),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC20)
    expect(result.isGovernance).to.be.true
    expect(result.isUnderlying).to.be.true
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect ERC721 token', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC721_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC721)
    expect(result.isGovernance).to.be.false
    expect(result.isUnderlying).to.be.false
  })

  it('should detect ERC1155 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC1155_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC1155)
    expect(result.isGovernance).to.be.false
  })

  it('should detect ERC777 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC777_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC777)
    expect(result.isGovernance).to.be.false
  })

  it('should detect ERC777 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0xUnrelatedBytecodeThatDoesNotMatchAnyFunctionHashes'),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.unknown)
    expect(result.isGovernance).to.be.false
  })

  it('should get empty getCode', async () => {
    const contractAddress = '0x0001'
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(contractAddress)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves('0x'),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.unknown)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
    expect(result.isGovernance).to.be.false
  })

  it('should getCode from address if implementation is zero address', async () => {
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(utils.zeroAddress)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC721_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC721)
    expect(result.implementationAddress).to.equal(utils.zeroAddress)
    expect(result.isGovernance).to.be.false
  })

  it('should handle an error when fetching bytecode', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().rejects(new Error('Failed to fetch bytecode')),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result.implementationAddress).to.be.null
    expect(result.proxy).to.be.false
    expect(result.type).to.eq(ITokenType.unknown)
    expect(result.isGovernance).to.be.false
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })
})
