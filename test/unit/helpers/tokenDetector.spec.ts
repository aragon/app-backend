import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenDetector, {
  ERC1155_FUNCTIONS,
  ERC20_FUNCTIONS,
  ERC721_FUNCTIONS,
  ERC777_FUNCTIONS,
  GOVERNANCE_ERC20_FUNCTIONS,
} from '@helpers/tokenDetector'
import { beforeEach } from 'mocha'
import { ITokenType, NetworksEnum } from '@types'
import { ZeroAddress } from 'ethers'
import { expect } from 'chai'
import { ConfigState } from '@state/configState'
import ProxyContractHelper from '@helpers/proxyContract'
import ProviderModule from '@modules/provider'
import { UnitTestUtils } from '@test/lib/utils'

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
    expect(result?.type).to.equal(ITokenType.native)
    expect(getImplementationAddressStub.notCalled).to.be.true
  })

  it('should detect ERC20 token', async () => {
    const contractAddress = '0x0001'
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(contractAddress)

    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC20_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.ERC20)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect ERC20 Governance token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox
        .stub()
        .resolves(simulateBytecodeForFunctions([...ERC20_FUNCTIONS, ...GOVERNANCE_ERC20_FUNCTIONS])),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.GovernanceERC20)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should detect ERC721 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC721_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.ERC721)
  })

  it('should detect ERC1155 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC1155_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.ERC1155)
  })

  it('should detect ERC777 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().resolves(simulateBytecodeForFunctions(ERC777_FUNCTIONS)),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.ERC777)
  })

  it('should detect ERC777 token', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().resolves('0xUnrelatedBytecodeThatDoesNotMatchAnyFunctionHashes'),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.unknown)
  })

  it('should get empty getCode', async () => {
    const contractAddress = '0x0001'
    const getImplementationAddressStub = sandbox
      .stub(ProxyContractHelper, 'getImplementationAddress')
      .resolves(contractAddress)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().resolves('0x'),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)
    expect(result?.type).to.equal(ITokenType.unknown)
    expect(getImplementationAddressStub.calledOnce).to.be.true
    expect(getImplementationAddressStub.calledWith('0xAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should handle an error when fetching bytecode', async () => {
    const getImplementationAddressStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves(null)
    sandbox.stub(ProviderModule, 'getProvider').returns({
      getCode: sandbox.stub().rejects(new Error('Failed to fetch bytecode')),
    } as any)

    const result = await TokenDetector.detectTokenType('0xAddress', NetworksEnum.ethereumMainnet)

    expect(result?.implementationAddress).to.be.null
    expect(result?.proxy).to.be.false
    expect(result?.type).to.eq(ITokenType.unknown)
    expect(getImplementationAddressStub.calledOnce).to.be.true
  })
})
