import * as sinon from 'sinon'
import { expect } from 'chai'
import { ITokenType, NetworksEnum } from '@types'
import { AlchemyProvider } from '@providers/accountAssetProvider/alchemyProvider'
import Web3Helper from '@helpers/web3'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import Logger from '@logger'
import { Models } from '@dbModels'
import TokenDetector from '@helpers/tokenDetector'

describe('AlchemyProvider', () => {
  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should return token balances of an address', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = {
        tokenBalances: [
          { contractAddress: '0xTokenAddress1', tokenBalance: '0x10' }, // 16
          { contractAddress: '0xTokenAddress2', tokenBalance: '0x1a' }, // 26
        ],
      }
      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(Web3Helper, 'parseAddress').returns(fakeAddress)
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)
      sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.ERC20, hasName: true, hasSymbol: true, hasDecimals: true } as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns({
        decimals: 0,
      } as any)

      const balances = await AlchemyProvider.getAccountBalances(fakeAddress, fakeNetwork)
      expect(balances.length).to.equal(2)
      expect(balances[0].tokenBalance).to.equal('16')
      expect(balances[1].tokenBalance).to.equal('26')
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('alchemy_getTokenBalances', [fakeAddress])).to.be.true
    })

    it('should return 0 if the token has not name, symbol and decimals', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const fakeResponse = {
        tokenBalances: [
          { contractAddress: '0xTokenAddress1', tokenBalance: '0x10' }, // 16
          { contractAddress: '0xTokenAddress2', tokenBalance: '0x1a' }, // 26
        ],
      }

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }

      sandbox.stub(Web3Helper, 'parseAddress').returns(fakeAddress)
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)
      sandbox
        .stub(TokenDetector, 'detectTokenType')
        .resolves({ type: ITokenType.ERC20, hasName: false, hasSymbol: false, hasDecimals: false } as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns({
        decimals: 0,
      } as any)

      const balances = await AlchemyProvider.getAccountBalances(fakeAddress, fakeNetwork)
      expect(balances.length).to.equal(0)
      expect(providerStub.send.calledOnce).to.be.true
    })

    it('should return an empty array on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      const loggerStubError = sandbox.stub(Logger, 'warn')
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)

      const balances = await AlchemyProvider.getAccountBalances(fakeAddress, fakeNetwork)
      expect(loggerStubError.calledOnce).to.be.true
      expect(balances).to.be.an('array').that.is.empty
      expect(providerStub.send.calledOnce).to.be.true
    })
  })
})
