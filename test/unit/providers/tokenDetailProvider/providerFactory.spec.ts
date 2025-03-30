import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderFactory from '@providers/tokenDetailProvider/providerFactory'
import { PeaqNetworkTokenProvider } from '@providers/tokenDetailProvider/peaqNetworkProvider'
import { DefaultNetworkTokenProvider } from '@providers/tokenDetailProvider/defaultNetworkProvider'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Module: ProviderFactory', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('Should handle if peaq network', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchTokenDetails')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchTokenDetails')

    await ProviderFactory.fetchTokenDetails(NetworksEnum.peaqMainnet, 'tokenAddress', {
      type: ITokenType.ERC20,
      isGovernance: false,
    })

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.true
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.false

    expect(
      peaqNetworkTokenProviderStub.calledWith(
        {
          type: ITokenType.ERC20,
          isGovernance: false,
        },
        'tokenAddress',
        NetworksEnum.peaqMainnet,
      ),
    ).to.be.true
  })

  it('Should handle if not peaq network and default', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchTokenDetails')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchTokenDetails')

    await ProviderFactory.fetchTokenDetails(NetworksEnum.ethereumMainnet, 'tokenAddress', {
      type: ITokenType.ERC20,
      isGovernance: false,
    })

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.false
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.true
    expect(
      defaultNetworkTokenProviderStub.calledWith(
        {
          type: ITokenType.ERC20,
          isGovernance: false,
        },
        'tokenAddress',
        NetworksEnum.ethereumMainnet,
      ),
    ).to.be.true
  })

  it('should handle fetchContractCreation', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchContractCreation')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchContractCreation')

    await ProviderFactory.fetchContractCreation('tokenAddress', NetworksEnum.peaqMainnet)

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.true
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.false

    expect(peaqNetworkTokenProviderStub.calledWith('tokenAddress', NetworksEnum.peaqMainnet)).to.be.true
  })

  it('should handle fetchContractCreation on default', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchContractCreation')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchContractCreation')

    await ProviderFactory.fetchContractCreation('tokenAddress', NetworksEnum.ethereumMainnet)

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.false
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.true

    expect(defaultNetworkTokenProviderStub.calledWith('tokenAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should handle fetchContractSourceCode with peaq network', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchContractSourceCode')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchContractSourceCode')

    await ProviderFactory.fetchContractSourceCode('tokenAddress', NetworksEnum.peaqMainnet)

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.true
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.false

    expect(peaqNetworkTokenProviderStub.calledWith('tokenAddress', NetworksEnum.peaqMainnet)).to.be.true
  })

  it('should handle fetchContractSourceCode with default network', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchContractSourceCode')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchContractSourceCode')

    await ProviderFactory.fetchContractSourceCode('tokenAddress', NetworksEnum.ethereumMainnet)

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.false
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.true

    expect(defaultNetworkTokenProviderStub.calledWith('tokenAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })

  it('should handle fetchBasicTokenInfo with peaq network', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchBasicTokenInfo')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchBasicTokenInfo')

    await ProviderFactory.fetchBasicTokenInfo({ network: NetworksEnum.peaqMainnet } as any)

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.true
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.false
  })

  it('should handle fetchBasicTokenInfo with default network', async () => {
    const peaqNetworkTokenProviderStub = sandbox.stub(PeaqNetworkTokenProvider, 'fetchBasicTokenInfo')
    const defaultNetworkTokenProviderStub = sandbox.stub(DefaultNetworkTokenProvider, 'fetchBasicTokenInfo')

    await ProviderFactory.fetchBasicTokenInfo({ network: NetworksEnum.ethereumMainnet } as any)

    expect(peaqNetworkTokenProviderStub.calledOnce).to.be.false
    expect(defaultNetworkTokenProviderStub.calledOnce).to.be.true
  })
})
