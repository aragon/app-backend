import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import KatanaProvider from '@modules/proxyProvider/katanaProvider'
import { NetworksEnum } from '@types'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import { ProxyToken } from '@modules/proxyToken'
import Web3Utils from '@helpers/web3Utils'
import EtherscanHelper from '@helpers/etherscan'
import utils from '@helpers/utils'

describe('Modules: KatanaProvider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should return formatted token balances', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet
      const tokenAddress = '0xabc1234567890abcdef1234567890abcdef12345'
      const parsedAddress = '0xAbc1234567890AbCdEf1234567890AbCdEf12345'

      const mockTokenBalances = [
        {
          contractAddress: tokenAddress,
          tokenBalance: '100.5',
          originalBalance: '100500000000000000000',
          priceUsd: '1.5',
        },
      ]

      const mockToken = { address: tokenAddress, symbol: 'TEST', name: 'Test Token' }

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      sandbox.stub(Web3Utils, 'parseAddress').returns(parsedAddress)

      // Act
      const result = await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal({
        contractAddress: parsedAddress,
        tokenBalance: '100.5',
        originalBalance: '100500000000000000000',
        priceUsd: '1.5',
      })
    })

    it('should call evmExplorerClient with ETHERSCAN explorer type', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet

      const evmStub = sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves([])

      // Act
      await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(evmStub.calledOnce).to.be.true
      expect(evmStub.firstCall.args[0]).to.equal(EvmExplorerEnum.ETHERSCAN)
      expect(evmStub.firstCall.args[1]).to.equal(address)
      expect(evmStub.firstCall.args[2]).to.equal(network)
    })

    it('should replace native token address with zeroAddress', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet
      const nativeTokenAddress = EtherscanHelper.nativeTokens[network]

      const mockTokenBalances = [
        {
          contractAddress: nativeTokenAddress,
          tokenBalance: '50.0',
          originalBalance: '50000000000000000000',
          priceUsd: '2.0',
        },
      ]

      const mockToken = { address: utils.zeroAddress, symbol: 'ETH', name: 'Ether' }

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      sandbox.stub(Web3Utils, 'parseAddress').returns(utils.zeroAddress)

      // Act
      await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(saveAndGetTokenStub.firstCall.args[0]).to.equal(utils.zeroAddress)
    })

    it('should filter out tokens when ProxyToken.saveAndGetToken returns null', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet

      const mockTokenBalances = [
        {
          contractAddress: '0xtoken1',
          tokenBalance: '100',
          originalBalance: '100000000000000000000',
          priceUsd: '1.0',
        },
        {
          contractAddress: '0xtoken2',
          tokenBalance: '200',
          originalBalance: '200000000000000000000',
          priceUsd: '2.0',
        },
        {
          contractAddress: '0xtoken3',
          tokenBalance: '300',
          originalBalance: '300000000000000000000',
          priceUsd: '3.0',
        },
      ]

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.onFirstCall().resolves({ address: '0xtoken1' } as any)
      saveAndGetTokenStub.onSecondCall().resolves(null) // This one should be filtered out
      saveAndGetTokenStub.onThirdCall().resolves({ address: '0xtoken3' } as any)
      sandbox.stub(Web3Utils, 'parseAddress').callsFake(addr => addr)

      // Act
      const result = await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.have.lengthOf(2)
      expect(result[0].contractAddress).to.equal('0xtoken1')
      expect(result[1].contractAddress).to.equal('0xtoken3')
    })

    it('should return empty array when evmExplorerClient returns empty array', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves([])

      // Act
      const result = await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.be.an('array').that.is.empty
    })

    it('should use original contractAddress when parseAddress returns null', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet
      const tokenAddress = '0xinvalidaddress'

      const mockTokenBalances = [
        {
          contractAddress: tokenAddress,
          tokenBalance: '100',
          originalBalance: '100000000000000000000',
          priceUsd: '1.0',
        },
      ]

      const mockToken = { address: tokenAddress, symbol: 'TEST', name: 'Test Token' }

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      // Act
      const result = await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(result[0].contractAddress).to.equal(tokenAddress)
    })

    it('should handle multiple tokens with mixed results', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet
      const nativeTokenAddress = EtherscanHelper.nativeTokens[network]

      const mockTokenBalances = [
        {
          contractAddress: nativeTokenAddress,
          tokenBalance: '10',
          originalBalance: '10000000000000000000',
          priceUsd: '2000',
        },
        {
          contractAddress: '0xerc20token',
          tokenBalance: '500',
          originalBalance: '500000000',
          priceUsd: '0.5',
        },
        {
          contractAddress: '0xunknowntoken',
          tokenBalance: '1000',
          originalBalance: '1000000000000000000000',
          priceUsd: '0',
        },
      ]

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.onFirstCall().resolves({ address: utils.zeroAddress } as any)
      saveAndGetTokenStub.onSecondCall().resolves({ address: '0xerc20token' } as any)
      saveAndGetTokenStub.onThirdCall().resolves(null) // Unknown token filtered out
      sandbox.stub(Web3Utils, 'parseAddress').callsFake(addr => addr)

      // Act
      const result = await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.have.lengthOf(2)
      expect(result[0].tokenBalance).to.equal('10')
      expect(result[1].tokenBalance).to.equal('500')
    })

    it('should return empty array when all tokens return null from ProxyToken', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet

      const mockTokenBalances = [
        {
          contractAddress: '0xtoken1',
          tokenBalance: '100',
          originalBalance: '100000000000000000000',
          priceUsd: '1.0',
        },
        {
          contractAddress: '0xtoken2',
          tokenBalance: '200',
          originalBalance: '200000000000000000000',
          priceUsd: '2.0',
        },
      ]

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      // Act
      const result = await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.be.an('array').that.is.empty
    })

    it('should call ProxyToken.saveAndGetToken for each token balance', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet

      const mockTokenBalances = [
        { contractAddress: '0xtoken1', tokenBalance: '100', originalBalance: '100', priceUsd: '1.0' },
        { contractAddress: '0xtoken2', tokenBalance: '200', originalBalance: '200', priceUsd: '2.0' },
        { contractAddress: '0xtoken3', tokenBalance: '300', originalBalance: '300', priceUsd: '3.0' },
      ]

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ address: '0x' } as any)
      sandbox.stub(Web3Utils, 'parseAddress').callsFake(addr => addr)

      // Act
      await KatanaProvider.getTokenBalances({ address, network })

      // Assert
      expect(saveAndGetTokenStub.callCount).to.equal(3)
      expect(saveAndGetTokenStub.firstCall.args).to.deep.equal(['0xtoken1', network])
      expect(saveAndGetTokenStub.secondCall.args).to.deep.equal(['0xtoken2', network])
      expect(saveAndGetTokenStub.thirdCall.args).to.deep.equal(['0xtoken3', network])
    })
  })
})
