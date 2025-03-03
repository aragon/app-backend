import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderFactory from '@modules/tokenDetail/providerFactory'
import { PeaqNetworkTokenProvider } from '@modules/tokenDetail/peaqNetworkProvider'
import { DefaultNetworkTokenProvider } from '@modules/tokenDetail/defaultNetworkProvider'
import { ITokenType, NetworksEnum } from '@types'
import {expect} from "chai";

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

    expect(peaqNetworkTokenProviderStub.calledWith({
      type: ITokenType.ERC20,
      isGovernance: false
    }, 'tokenAddress', NetworksEnum.peaqMainnet)).to.be.true
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
    expect(defaultNetworkTokenProviderStub.calledWith({
      type: ITokenType.ERC20,
      isGovernance: false
    }, 'tokenAddress', NetworksEnum.ethereumMainnet)).to.be.true
  })
})