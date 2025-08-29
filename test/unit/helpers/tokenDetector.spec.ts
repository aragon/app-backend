import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenDetector from '@helpers/tokenDetector'
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
    return '0x' + functions.map(func => TokenDetector._generateFunctionHash(func)).join('')
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
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(TokenDetector.ERC20)),
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
        .resolves(
          simulateBytecodeForFunctions([
            ...TokenDetector.ERC20,
            ...TokenDetector.ERC20_VOTES,
            ...TokenDetector.HAS_UNDERLYING,
          ]),
        ),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC20)
    expect(result.isGovernance).to.be.true
    expect(result.hasUnderlying).to.be.true
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect ERC721 token', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(TokenDetector.ERC721)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC721)
    expect(result.isGovernance).to.be.false
    expect(result.hasUnderlying).to.be.false
  })

  it('should detect ERC1155 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(TokenDetector.ERC1155)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC1155)
    expect(result.isGovernance).to.be.false
  })

  it('should detect ERC777 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(TokenDetector.ERC777)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC777)
    expect(result.isGovernance).to.be.false
  })

  it('should detect escrowAdapter token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(TokenDetector.ESCROW_ADAPTER)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.escrowAdapter)
    expect(result.isGovernance).to.be.false
    expect(result.hasUnderlying).to.be.false
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect unknown token', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
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
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(TokenDetector.ERC721)),
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

  it('should detect token with name, symbol, and decimals properties', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox
        .stub()
        .resolves(
          simulateBytecodeForFunctions([
            ...TokenDetector.ERC20,
            ...TokenDetector.HAS_NAME,
            ...TokenDetector.HAS_SYMBOL,
            ...TokenDetector.HAS_DECIMALS,
          ]),
        ),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC20)
    expect(result.hasName).to.be.true
    expect(result.hasSymbol).to.be.true
    expect(result.hasDecimals).to.be.true
  })

  it('should detect token with delegate and clockMode properties', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox
        .stub()
        .resolves(
          simulateBytecodeForFunctions([
            ...TokenDetector.ERC20,
            ...TokenDetector.HAS_DELEGATE,
            ...TokenDetector.HAS_CLOCK_MODE,
          ]),
        ),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC20)
    expect(result.hasDelegate).to.be.true
    expect(result.hasClockMode).to.be.true
  })

  it('should detect token with totalSupply and balanceOf properties', async () => {
    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode: sandbox
        .stub()
        .resolves(
          simulateBytecodeForFunctions([
            ...TokenDetector.ERC20,
            ...TokenDetector.HAS_TOTAL_SUPPLY,
            ...TokenDetector.HAS_BALANCE_OF_ERC20,
            ...TokenDetector.HAS_BALANCE_OF_ERC777,
          ]),
        ),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result.type).to.equal(ITokenType.ERC20)
    expect(result.hasTotalSupply).to.be.true
    expect(result.hasBalanceOfERC20).to.be.true
    expect(result.hasBalanceOfERC777).to.be.true
  })
})
