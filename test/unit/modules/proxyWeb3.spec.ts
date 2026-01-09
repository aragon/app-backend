import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: ProxyWeb3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getNativeBalance', () => {
    it('should return the balance of an address', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = '0x1bc16d674ec80000' // 2 ETH in wei

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns({
        decimals: 18,
      } as any)

      const balance = await Web3Provider.getNativeBalance({
        address: fakeAddress,
        network: fakeNetwork,
      } as any)
      expect(balance).to.equal('2.0') // Check if conversion from wei to ether is correct
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBalance', [fakeAddress, 'latest'])).to.be.true
    })

    it('should return "0" when token is not saved', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = '0x1bc16d674ec80000' // 2 ETH in wei

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns(false as any)

      const balance = await Web3Provider.getNativeBalance({
        address: fakeAddress,
        network: fakeNetwork,
      } as any)

      expect(balance).to.equal('0') // Check if conversion from wei to ether is correct
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBalance', [fakeAddress, 'latest'])).to.be.true
    })

    it('should return "0" on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      const errorLoggerStub = sandbox.stub(logger, 'error')
      const balance = await Web3Provider.getNativeBalance({
        address: fakeAddress,
        network: fakeNetwork,
      } as any)
      expect(balance).to.equal('0')

      expect(errorLoggerStub.calledOnce).to.be.true
      expect(providerStub.send.calledOnce).to.be.true
    })
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
      sandbox.stub(Web3Utils, 'parseAddress').returns(fakeAddress)
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)
      sandbox.stub(ProxyToken, 'saveAndGetToken').returns({
        decimals: 0,
      } as any)

      const balances = await Web3Provider.getTokenBalances({
        address: fakeAddress,
        network: fakeNetwork,
      } as any)
      expect(balances.length).to.equal(2)
      expect(balances[0].tokenBalance).to.equal('16')
      expect(balances[1].tokenBalance).to.equal('26')
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('alchemy_getTokenBalances', [fakeAddress])).to.be.true
    })

    it('should return an empty array on error', async () => {
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('RPC error')),
      }
      const loggerStubError = sandbox.stub(logger, 'error')
      sandbox.stub(ProviderModule, 'getProvider').returns(providerStub as any)

      const balances = await Web3Provider.getTokenBalances({
        address: fakeAddress,
        network: fakeNetwork,
      } as any)
      expect(loggerStubError.calledOnce).to.be.true
      expect(balances).to.be.an('array').that.is.empty
      expect(providerStub.send.calledOnce).to.be.true
    })
  })
})
