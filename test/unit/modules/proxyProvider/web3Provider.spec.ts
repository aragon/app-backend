import Alchemy from '@helpers/alchemy'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { ProxyToken } from '@modules/proxyToken'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('Web3Provider', () => {
  let sandbox: any
  let loggerStub: any
  let loggerWarnStub: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getNativeBalance', () => {
    it('should return properly formatted balance when valid balance is returned', async () => {
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const balance = '1000000000000000000' // 1 ETH
      const mockToken = { address: utils.zeroAddress, decimals: 18 }
      const expectedFormattedBalance = '1'

      const getNativeBalanceStub = sandbox.stub(Web3Helper, 'getNativeBalance').resolves(balance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(mockToken as any)
      const handleAlchemyCrazyBalanceStub = sandbox
        .stub(Alchemy, 'handleAlchemyCrazyBalance')
        .returns(expectedFormattedBalance)
      const alchemyCrazyBalanceOnErrorStub = sandbox.stub(Alchemy, 'alchemyCrazyBalanceOnError')

      // Act
      const result = await Web3Provider.getNativeBalance({ address, network })

      // Assert
      expect(getNativeBalanceStub.calledOnceWith(address, network)).to.be.true
      expect(saveAndGetTokenStub.calledOnceWith(utils.zeroAddress, network)).to.be.true
      expect(handleAlchemyCrazyBalanceStub.calledOnceWith(balance, mockToken.decimals)).to.be.true
      expect(alchemyCrazyBalanceOnErrorStub.calledOnce).to.be.true
      expect(result).to.equal(expectedFormattedBalance)
    })

    it('should return 0 when balance is 0', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const balance = '0'

      const getNativeBalanceStub = sandbox.stub(Web3Helper, 'getNativeBalance').resolves(balance)

      // Act
      const result = await Web3Provider.getNativeBalance({ address, network })

      // Assert
      expect(getNativeBalanceStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.equal('0')
    })

    it('should return 0 when token is not found', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const balance = '1000000000000000000' // 1 ETH

      const getNativeBalanceStub = sandbox.stub(Web3Helper, 'getNativeBalance').resolves(balance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)

      // Act
      const result = await Web3Provider.getNativeBalance({ address, network })

      // Assert
      expect(getNativeBalanceStub.calledOnceWith(address, network)).to.be.true
      expect(saveAndGetTokenStub.calledOnceWith(utils.zeroAddress, network)).to.be.true
      expect(loggerStub.calledOnce).to.be.true
      expect(result).to.equal('0')
    })
  })

  describe('getTokenBalances', () => {
    it('should return properly formatted token balances', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const token1Address = '0xtoken1'
      const token2Address = '0xtoken2'
      const token1Balance = '1000000000000000000' // 1 Token
      const token2Balance = '2000000000000000000' // 2 Token

      const tokensBalance = [
        { contractAddress: token1Address, tokenBalance: token1Balance },
        { contractAddress: token2Address, tokenBalance: token2Balance },
      ]

      const token1 = { address: token1Address, decimals: 18 }
      const token2 = { address: token2Address, decimals: 18 }

      const getTokenBalancesStub = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(tokensBalance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs(token1Address, network).resolves(token1)
      saveAndGetTokenStub.withArgs(token2Address, network).resolves(token2)

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs(token1Address).returns(token1Address)
      parseAddressStub.withArgs(token2Address).returns(token2Address)

      const handleAlchemyCrazyBalanceStub = sandbox.stub(Alchemy, 'handleAlchemyCrazyBalance')
      handleAlchemyCrazyBalanceStub.withArgs(token1Balance, token1.decimals).returns('1')
      handleAlchemyCrazyBalanceStub.withArgs(token2Balance, token2.decimals).returns('2')

      // Act
      const result = await Web3Provider.getTokenBalances({ address, network })

      // Assert
      expect(getTokenBalancesStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.deep.equal({
        contractAddress: token1Address,
        tokenBalance: '1',
        originalBalance: token1Balance,
      })
      expect(result[1]).to.deep.equal({
        contractAddress: token2Address,
        tokenBalance: '2',
        originalBalance: token2Balance,
      })
    })

    it('should filter out tokens with empty data balance', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const token1Address = '0xtoken1'
      const token2Address = '0xtoken2'
      const token1Balance = utils.emptyData
      const token2Balance = '2000000000000000000' // 2 Token

      const tokensBalance = [
        { contractAddress: token1Address, tokenBalance: token1Balance },
        { contractAddress: token2Address, tokenBalance: token2Balance },
      ]

      const token2 = { address: token2Address, decimals: 18 }

      const getTokenBalancesStub = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(tokensBalance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs(token1Address, network).resolves(null)
      saveAndGetTokenStub.withArgs(token2Address, network).resolves(token2)

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs(token2Address).returns(token2Address)

      const handleAlchemyCrazyBalanceStub = sandbox.stub(Alchemy, 'handleAlchemyCrazyBalance')
      handleAlchemyCrazyBalanceStub.withArgs(token2Balance, token2.decimals).returns('2')

      // Act
      const result = await Web3Provider.getTokenBalances({ address, network })

      // Assert
      expect(getTokenBalancesStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.deep.equal({
        contractAddress: token2Address,
        tokenBalance: '2',
        originalBalance: token2Balance,
      })
    })

    it('should filter out tokens that are not found', async () => {
      // Arrange
      const address = '0x123'
      const network = NetworksEnum.ethereumMainnet
      const token1Address = '0xtoken1'
      const token2Address = '0xtoken2'
      const token1Balance = '1000000000000000000' // 1 Token
      const token2Balance = '2000000000000000000' // 2 Token

      const tokensBalance = [
        { contractAddress: token1Address, tokenBalance: token1Balance },
        { contractAddress: token2Address, tokenBalance: token2Balance },
      ]

      const getTokenBalancesStub = sandbox.stub(Web3Helper, 'getTokenBalances').resolves(tokensBalance)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken')
      saveAndGetTokenStub.withArgs(token1Address, network).resolves(null)
      saveAndGetTokenStub.withArgs(token2Address, network).resolves(null)

      // Act
      const result = await Web3Provider.getTokenBalances({ address, network })

      // Assert
      expect(getTokenBalancesStub.calledOnceWith(address, network)).to.be.true
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe('fetchContractCreation', () => {
    it('should return contract creation data using fallback logic', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const expectedResult = {
        blockNumber: 100,
        transactionHash: '0xtxhash',
        address,
      }

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN])
      expect(typeof fallbackArgs[1]).to.equal('function')
      expect(typeof fallbackArgs[2]).to.equal('object')
    })

    it('should return default values when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await Web3Provider.fetchContractCreation({ address, network })

      expect(result).to.deep.equal({
        blockNumber: 0,
        transactionHash: null,
        address,
      })
    })

    it('should pass zkSync in case of zkSync network', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.zksyncMainnet
      const expectedResult = {
        blockNumber: 100,
        transactionHash: '0xtxhash',
        address,
      }

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should log warning when onError callback is triggered', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        options.onError(new Error('Test error'), EvmExplorerEnum.ZKSYNC, 0)
        return { blockNumber: 100, transactionHash: '0xtxhash', address }
      })

      await Web3Provider.fetchContractCreation({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.firstCall.args[0]).to.include('Failed to fetch contract creation')
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should return contract source code using fallback logic', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const expectedResult = [
        {
          SourceCode: 'contract source code',
          ContractName: 'TestContract',
          ABI: '[]',
        },
      ]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([EvmExplorerEnum.ETHERSCAN, EvmExplorerEnum.ROUTESCAN])
    })

    it('should return null when all explorers fail', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(utils, 'fallbackCall').resolves(null)

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(result).to.be.null
    })

    it('should pass zkSync in case of zkSync network', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.zksyncMainnet
      const expectedResult = [
        {
          SourceCode: 'contract source code',
          ContractName: 'TestContract',
          ABI: '[]',
        },
      ]

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').resolves(expectedResult)

      const result = await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(result).to.deep.equal(expectedResult)

      const fallbackArgs = fallbackCallStub.firstCall.args
      expect(fallbackArgs[0]).to.deep.equal([
        EvmExplorerEnum.ZKSYNC,
        EvmExplorerEnum.ETHERSCAN,
        EvmExplorerEnum.ROUTESCAN,
      ])
    })

    it('should log warning when onError callback is triggered', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      const fallbackCallStub = sandbox.stub(utils, 'fallbackCall').callsFake(async (explorers, fn, options) => {
        options.onError(new Error('Test error'), EvmExplorerEnum.ETHERSCAN, 0)
        return [{ SourceCode: 'code', ContractName: 'Test', ABI: '[]' }]
      })

      await Web3Provider.fetchContractSourceCode({ address, network })

      expect(fallbackCallStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.firstCall.args[0]).to.include('Failed to fetch contract source code')
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return contract name when source code is found', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(sourceCode as any)

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: 'address',
        name: 'TestContract',
      })
    })

    it('should return null name when source code is not found', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(null)

      const result = await Web3Provider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: 'address',
        name: null,
      })
    })
  })
})
