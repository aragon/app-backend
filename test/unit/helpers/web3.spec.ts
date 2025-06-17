import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import { Interface } from 'ethers'
import logger from '@logger'
import proxyquire from 'proxyquire'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'
import BottleneckModule from '@modules/bottleneck'
import Web3Utils from '@helpers/web3Utils'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('supportsInterface', () => {
    it('supportsInterface', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSupportsInterface = sandbox.stub().resolves(true)
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { supportsInterface: stubSupportsInterface }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.supportsInterface(
        '0xTokenAddress',
        '0xInterfaceId',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.true
    })

    it('supportsInterface', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSupportsInterface = sandbox.stub().rejects(new Error('fake-error'))
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { supportsInterface: stubSupportsInterface }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.supportsInterface(
        '0xTokenAddress',
        '0xInterfaceId',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.false
    })
  })

  describe('getBlockNumber', () => {
    it('should return latest block number when blockNumber is "latest"', async () => {
      const network = NetworksEnum.ethereumMainnet
      const expectedBlockNumber = 123456
      const providerStub = {
        getBlockNumber: sandbox.stub().resolves(expectedBlockNumber),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)

      const blockNumber = await Web3Helper.getBlockNumber('latest', network)
      expect(blockNumber).to.equal(expectedBlockNumber)
    })

    it('should return -1 when provider call fails', async () => {
      const network = NetworksEnum.ethereumMainnet
      const providerStub = {
        getBlockNumber: sandbox.stub().rejects(new Error('Provider error')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const blockNumber = await Web3Helper.getBlockNumber('latest', network)
      expect(blockNumber).to.equal(-1)
      expect(loggerStub.calledOnceWith('Error getBlockNumber' as any)).to.be.true
    })

    it('should return the provided block number when blockNumber is a valid number', async () => {
      const blockNumber = 1000
      const result = await Web3Helper.getBlockNumber(blockNumber, NetworksEnum.ethereumMainnet)
      expect(result).to.equal(blockNumber)
    })

    it('should return -1 when provider is undefined', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(undefined)
      const loggerStub = sandbox.stub(logger, 'error')

      const blockNumber = await Web3Helper.getBlockNumber('latest', NetworksEnum.ethereumMainnet)
      expect(blockNumber).to.equal(-1)
      expect(loggerStub.calledOnceWith('Error getBlockNumber' as any)).to.be.true
    })
  })

  describe('getBlock', () => {
    it('should return the block data when provider call succeeds', async () => {
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 123456
      const mockBlockData = { number: blockNumber, hash: '0xabc' }

      const providerStub = {
        getBlock: sandbox.stub().resolves(mockBlockData),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)

      const block = await Web3Helper.getBlock(blockNumber, network)
      expect(block).to.deep.equal(mockBlockData)
    })

    it('should return null when provider call fails', async () => {
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 123456

      const providerStub = {
        getBlock: sandbox.stub().rejects(new Error('Provider error')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: any) => fn() } as any)
      const loggerStub = sandbox.stub(logger, 'error')

      const block = await Web3Helper.getBlock(blockNumber, network)
      expect(block).to.be.null
      expect(loggerStub.calledOnceWith('Error getBlock' as any)).to.be.true
    })

    it('should return null when provider is undefined', async () => {
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(undefined)
      const loggerStub = sandbox.stub(logger, 'error')

      const block = await Web3Helper.getBlock(123456, NetworksEnum.ethereumMainnet)
      expect(block).to.be.null
      expect(loggerStub.calledOnceWith('Error getBlock' as any)).to.be.true
    })
  })

  describe('getLogs', () => {
    it('should getBlockTimestamp', async () => {
      const stubGetLogs = sandbox.stub().resolves(true)
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getLogs: stubGetLogs,
      } as any)

      const filter = {
        fromBlock: '0x760d40',
        toBlock: '0x760d40',
        topics: [
          [
            '0x62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3',
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        ],
      }

      const res = await Web3Helper.getLogs(filter, NetworksEnum.ethereumMainnet)

      expect(res).to.be.true
      expect(stubGetLogs.calledOnceWith(filter)).to.be.true
    })

    it('should fail getLogs', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      const stubGetLogs = sandbox.stub().rejects(new Error('fake-error'))
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getLogs: stubGetLogs,
      } as any)

      const filter = {
        fromBlock: '0x760d40',
        toBlock: '0x760d40',
        topics: [
          [
            '0x62c2c8e34665db7c56b2cabd7f5fb9702ccd352ffa8150147e450797e9f8e8f3',
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        ],
      }

      const res = await Web3Helper.getLogs(filter, NetworksEnum.ethereumMainnet)

      expect(res).to.be.null
      expect(stubLogger.calledOnce).to.be.true
      expect(stubGetLogs.calledOnceWith(filter)).to.be.true
    })
  })

  describe('getBlockTimestamp', () => {
    it('should getBlockTimestamp', async () => {
      const blockNumber = 123456
      const expectedTimestamp = 1615551010 // Example Unix timestamp
      const stubGetBlock = sandbox.stub().resolves({ timestamp: expectedTimestamp })
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getBlock: stubGetBlock,
      } as any)

      const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, NetworksEnum.ethereumMainnet)

      expect(timestamp).to.equal(expectedTimestamp)
      expect(stubGetBlock.calledOnceWith(blockNumber)).to.be.true
    })

    it('should fail getBlockTimestamp', async () => {
      const blockNumber = 123456
      const stubLogger = sandbox.stub(logger, 'error')
      const stubGetBlock = sandbox.stub().rejects(new Error('fake-error'))
      const resolveName = sandbox.stub().resolves('0x000001')

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        resolveName,
        getBlock: stubGetBlock,
      } as any)

      const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, NetworksEnum.ethereumMainnet)

      expect(timestamp).to.equal(0)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubGetBlock.calledOnceWith(blockNumber)).to.be.true
    })
  })

  describe('getTokenBalanceAtBlock', () => {
    it('should get the token balance at a specific block', async () => {
      const providerSendStub = sandbox.stub().resolves('0x' + ''.padStart(63, '0') + 1)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        call: providerSendStub,
      } as any)

      const result = await Web3Helper.getTokenBalanceAtBlock({
        address: '0x36466a17feead01870e2781f608ccbffc9977081',
        blockNumber: 123456,
        tokenAddress: '0x84DaD4E4A4d1510052D39e916330372db8cD1238',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.equal('1')
    })

    it('should throw error if the provider fails', async () => {
      const providerSendStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        call: providerSendStub,
      } as any)

      const params = {
        address: '0x36466a17feead01870e2781f608ccbffc9977081',
        blockNumber: 123456,
        tokenAddress: '0x84DaD4E4A4d1510052D39e916330372db8cD1238',
        network: NetworksEnum.ethereumMainnet,
      }

      const loggerWarnStub = sandbox.stub(logger, 'error')

      const returnedValue = await Web3Helper.getTokenBalanceAtBlock(params)
      expect(returnedValue).to.equal('0')
      expect(providerSendStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnceWith('Error getErc20BalanceAtBlock' as any)).to.be.true
    })
  })

  describe('getChainAdjustedBlockNumber', () => {
    it('should return L1 block number on Arbitrum successfully', async () => {
      const arbBlock = 987654
      const l1Block = 555555
      const providerStub = {
        send: sandbox.stub().resolves(`0x${BigInt(l1Block).toString(16)}`),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      const result = await Web3Helper.getChainAdjustedBlockNumber(arbBlock, NetworksEnum.arbitrumMainnet)
      expect(result).to.equal(l1Block - 1)
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.firstCall.args[0]).to.equal('eth_call')
      expect(providerStub.send.firstCall.args[1][0].to).to.equal('0x7eCfBaa8742fDf5756DAC92fbc8b90a19b8815bF')
    })

    it('should return L1 block number on Cron Network successfully', async () => {
      const cronBlock = 876543
      const l1Block = 444444
      const providerStub = {
        send: sandbox.stub().resolves(`0x${BigInt(l1Block).toString(16)}`),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      const result = await Web3Helper.getChainAdjustedBlockNumber(cronBlock, NetworksEnum.cornMainnet)
      expect(result).to.equal(l1Block - 1)
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.firstCall.args[0]).to.equal('eth_call')
      expect(providerStub.send.firstCall.args[1][0].to).to.equal('0xcA11bde05977b3631167028862bE2a173976CA11')
    })

    it('should return the original block number for other networks', async () => {
      const blockNumber = 123456
      const result = await Web3Helper.getChainAdjustedBlockNumber(blockNumber, NetworksEnum.ethereumMainnet)
      expect(result).to.equal(blockNumber)
    })

    it('should return the original block number and log an error if an exception occurs', async () => {
      const arbBlock = 987654
      const providerStub = {
        send: sandbox.stub().rejects(new Error('fake error')),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      const stubLogger = sandbox.stub(logger, 'error')

      const result = await Web3Helper.getChainAdjustedBlockNumber(arbBlock, NetworksEnum.arbitrumMainnet)
      expect(result).to.equal(arbBlock)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.firstCall.args[0]).to.equal('Error _getChainAdjustedBlockNumber')
    })

    it('should calculate the adjusted block number correctly', async () => {
      const blockTag = '0x1000'
      const contractAddr = '0x7eCfBaa8742fDf5756DAC92fbc8b90a19b8815bF'
      const functionName = 'getL1BlockNumber()'
      const network = NetworksEnum.arbitrumMainnet
      const providerStub = {
        send: sandbox.stub().resolves('0x2000'),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      const result = await Web3Helper._getChainAdjustedBlockNumber(blockTag, contractAddr, functionName, network)
      expect(result).to.equal(0x2000 - 1)
      expect(providerStub.send.calledOnce).to.be.true
    })

    it('should return the blockTag number when an error occurs', async () => {
      const blockTag = '0x1000'
      const contractAddr = '0x7eCfBaa8742fDf5756DAC92fbc8b90a19b8815bF'
      const functionName = 'getL1BlockNumber()'
      const network = NetworksEnum.arbitrumMainnet
      const providerStub = {
        send: sandbox.stub().rejects(new Error('Provider error')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      const stubLogger = sandbox.stub(logger, 'error')

      const result = await Web3Helper._getChainAdjustedBlockNumber(blockTag, contractAddr, functionName, network)
      expect(result).to.equal(0x1000)
      expect(providerStub.send.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.firstCall.args[0]).to.equal('Error _getChainAdjustedBlockNumber')
    })
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

      const balance = await Web3Helper.getNativeBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('0x1bc16d674ec80000')
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

      const balance = await Web3Helper.getNativeBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal('0x1bc16d674ec80000')
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
      const balance = await Web3Helper.getNativeBalance(fakeAddress, fakeNetwork)
      expect(balance).to.equal(null)

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

      const balances = await Web3Helper.getTokenBalances(fakeAddress, fakeNetwork)
      expect(balances.length).to.equal(2)
      expect(balances[0].tokenBalance).to.equal('0x10')
      expect(balances[1].tokenBalance).to.equal('0x1a')
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

      const balances = await Web3Helper.getTokenBalances(fakeAddress, fakeNetwork)
      expect(loggerStubError.calledOnce).to.be.true
      expect(balances).to.be.an('array').that.is.empty
      expect(providerStub.send.calledOnce).to.be.true
    })
  })

  describe('getTransaction', () => {
    it('should getTransaction successfully', async () => {
      const txHash = '0x0'
      const getTransactionStub = sandbox.stub().resolves(true)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransaction: getTransactionStub,
      } as any)

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
    })

    it('should fails getTransaction', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(logger, 'error')
      const getTransactionStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransaction: getTransactionStub,
      } as any)

      const result = await Web3Helper.getTransaction(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(getTransactionStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction' as any)).to.be.true
    })
  })

  describe('getTransactionReceipt', () => {
    it('should getTransactionReceipt successfully', async () => {
      const txHash = '0x0'
      const getTransactionReceiptStubStub = sandbox.stub().resolves(true)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: getTransactionReceiptStubStub,
      } as any)

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.true
      expect(getTransactionReceiptStubStub.calledOnceWith(txHash)).to.be.true
    })

    it('should fails getTransactionReceipt', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(logger, 'error')
      const getTransactionReceiptStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        getTransactionReceipt: getTransactionReceiptStub,
      } as any)

      const result = await Web3Helper.getTransactionReceipt(txHash, NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction receipt' as any)).to.be.true
    })
  })

  describe('getUnderlying', () => {
    it('should return the underlying address when the call is successful', async () => {
      const stubUnderlying = sandbox.stub().resolves('0xUnderlyingAddress')
      const fakeProvider = {}
      // Use proxyquire to override dependencies:
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          // When a new Contract is created, return an object with our stubbed underlying function.
          Contract: function () {
            return { underlying: stubUnderlying }
          },
        },
        ProviderModule: {
          getAnyRpcProvider: () => fakeProvider,
        },
      })

      const result = await MockedWeb3Helper.getUnderlying('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal('0xUnderlyingAddress')
      expect(stubUnderlying.calledOnce).to.be.true
    })

    it('should return null and log a warning when the underlying call fails', async () => {
      const stubUnderlying = sandbox.stub().rejects(new Error('Underlying error'))
      const fakeProvider = {}
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { underlying: stubUnderlying }
          },
        },
        ProviderModule: {
          getAnyRpcProvider: () => fakeProvider,
        },
      })

      const result = await MockedWeb3Helper.getUnderlying('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(stubUnderlying.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.firstCall.args[0]).to.equal('Error getting underlying')
    })
  })

  describe('getTokenTotalSupply', () => {
    it('should getTokenTotalSupply', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubTotalSupply = sandbox.stub().resolves(200n)

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenTotalSupply('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(200n)
      expect(stubTotalSupply.calledOnce).to.be.true
    })

    it('should fails return token info', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubTotalSupply = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenTotalSupply('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(0n)
      expect(stubTotalSupply.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error getting token total supply' as any)).to.be.true
    })
  })

  describe('getMultisigSettings', () => {
    it('should getMultisigSettings', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSettings = sandbox.stub().resolves({ minApprovals: 1n, isListed: true })

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { multisigSettings: stubSettings }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getMultisigSettings('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result.minApprovals).to.eq(1n)
      expect(result.isListed).to.eq(true)
      expect(stubSettings.calledOnce).to.be.true
    })

    it('should fails return multisig settings', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubSettings = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { multisigSettings: stubSettings }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getMultisigSettings('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(undefined)
      expect(stubSettings.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error getting multisig settings' as any)).to.be.true
    })
  })

  describe('getTokenInfo', () => {
    it('should return token info', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().resolves('Test Token')
      const stubSymbol = sandbox.stub().resolves('TST')
      const stubDecimals = sandbox.stub().resolves(18n)
      const stubTotalSupply = sandbox.stub().resolves(200n)

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol, decimals: stubDecimals, totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal({
        address: '0xTokenAddress',
        name: 'Test Token',
        symbol: 'TST',
        decimals: 18,
        totalSupply: '200',
      })

      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubDecimals.calledOnce).to.be.true
      expect(stubTotalSupply.calledOnce).to.be.true
    })

    it('should fails return token info', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().rejects(new Error('Test Error'))
      const stubSymbol = sandbox.stub().rejects(new Error('Test Error'))
      const stubDecimals = sandbox.stub().rejects(new Error('Test Error'))
      const stubTotalSupply = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol, decimals: stubDecimals, totalSupply: stubTotalSupply }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getTokenInfo('0xTokenAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal({
        decimals: '0',
        address: '0xTokenAddress',
      })

      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubDecimals.calledOnce).to.be.true
      expect(stubTotalSupply.calledOnce).to.be.true
      expect(stubLogger.callCount).to.eq(4)
    })
  })

  describe('getERC20Balance', () => {
    it('should return the ERC20 balance of an address', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { balanceOf: sandbox.stub().resolves(1000n) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const fakeTokenAddress = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const balance = await MockedWeb3Helper.getERC20Balance(fakeAddress, fakeTokenAddress, fakeNetwork)
      expect(balance).to.equal(1000n)
    })

    it('should return "0" on error ERC20', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { balanceOf: sandbox.stub().rejects(new Error('fake-error')) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const fakeTokenAddress = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const balance = await MockedWeb3Helper.getERC20Balance(fakeTokenAddress, fakeAddress, fakeNetwork)
      expect(balance).to.equal(0n)
    })
  })

  describe('getDaoOsVersion', () => {
    it('should return the DAO OS version when protocolVersion is available', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubProtocolVersion = sandbox.stub().resolves([2, 3, 4]) // Mocked protocol version

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { protocolVersion: stubProtocolVersion }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getDaoOsVersion('0xDaoAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('2.3.4')
      expect(stubProtocolVersion.calledOnce).to.be.true
    })

    it('should return default version "1.0.0" if protocolVersion call fails', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubProtocolVersion = sandbox.stub().rejects(new Error('fake-error'))

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { protocolVersion: stubProtocolVersion }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedWeb3Helper.getDaoOsVersion('0xDaoAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.equal('1.0.0') // Default fallback version
      expect(stubProtocolVersion.calledOnce).to.be.true
    })
  })

  describe('isMultisigMemberAtBlock', () => {
    it('should check if the user is member of multisig at certain block', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListedAtBlock: sandbox.stub().resolves(true) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const multisigPlugin = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const stat = await MockedWeb3Helper.isMultisigMemberAtBlock(multisigPlugin, fakeAddress, 123, fakeNetwork)
      expect(stat).to.equal(true)
    })

    it('should return false when  ERC20', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListedAtBlock: sandbox.stub().rejects(new Error('fake-error')) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      sandbox.stub(logger, 'error')
      const multisigPlugin = '0xTokenAddress'
      const fakeAddress = '0x1234567890123456789012345678901234567890'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const stat = await MockedWeb3Helper.isMultisigMemberAtBlock(multisigPlugin, fakeAddress, 123, fakeNetwork)
      expect(stat).to.equal(false)
    })
  })

  describe('getBLockReceipts', () => {
    it('should return the block receipts with logs', async () => {
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const fakeResponse = []

      const providerStub = {
        send: sandbox.stub().resolves(fakeResponse),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerStub as any)

      await Web3Helper.getBlockReceipts(fakeNetwork, 12321)
      expect(providerStub.send.calledOnce).to.be.true
      expect(providerStub.send.calledWith('eth_getBlockReceipts', [`0x${(12321).toString(16)}`])).to.be.true
    })

    it('should throw error if the provider fails', async () => {
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const providerSendStub = sandbox.stub().rejects(new Error('fake-error'))

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
        send: providerSendStub,
      } as any)

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const returnedValue = await Web3Helper.getBlockReceipts(fakeNetwork, 12321)
      expect(returnedValue).to.be.null
      expect(providerSendStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error getBlockReceipts' as any)).to.be.true
    })
  })

  describe('getTargetConfig', () => {
    it('should return false when error getting target config', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { getTargetConfig: sandbox.stub().rejects(new Error('fake-error')) }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const loggerStub = sandbox.stub(logger, 'error')
      const plugin = '0xTokenAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getTargetConfig(plugin, fakeNetwork)
      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should return the target config', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              getTargetConfig: sandbox.stub().resolves({
                target: '0xsomeaddress',
              }),
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const plugin = '0xTokenAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getTargetConfig(plugin, fakeNetwork)
      expect(result).to.be.equal('0xsomeaddress')
    })
  })

  describe('getVotingToken', () => {
    it('should return the voting token address successfully', async () => {
      const stubVotingToken = sandbox.stub().resolves('0xVotingTokenAddress')
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { getVotingToken: stubVotingToken }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getVotingToken(fakePluginAddress, fakeNetwork)

      expect(result).to.equal('0xVotingTokenAddress')
      expect(stubVotingToken.calledOnce).to.be.true
    })

    it('should return null if fetching voting token address fails', async () => {
      const stubVotingToken = sandbox.stub().rejects(new Error('fake-error'))
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { getVotingToken: stubVotingToken }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getVotingToken(fakePluginAddress, fakeNetwork)

      expect(result).to.be.null
      expect(stubVotingToken.calledOnce).to.be.true
    })
  })

  describe('getVotingEscrowAddress', () => {
    it('should return the voting escrow address successfully', async () => {
      const stubEscrow = sandbox.stub()
      const stubLockNFT = sandbox.stub()
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              escrow: stubEscrow,
              lockNFT: stubLockNFT,
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet
      const expectedEscrowAddress = '0xEscrowAddress'

      stubEscrow.resolves(expectedEscrowAddress)

      const result = await MockedWeb3Helper.getVotingEscrowAddress(fakePluginAddress, fakeNetwork)

      expect(result).to.equal(expectedEscrowAddress)
      expect(stubEscrow.calledOnce).to.be.true
    })

    it('should return null if fetching escrow address fails', async () => {
      const stubEscrow = sandbox.stub()
      const stubLockNFT = sandbox.stub()
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return {
              escrow: stubEscrow,
              lockNFT: stubLockNFT,
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      stubEscrow.rejects(new Error('fake-error'))

      const result = await MockedWeb3Helper.getVotingEscrowAddress(fakePluginAddress, fakeNetwork)

      expect(result).to.be.null
      expect(stubEscrow.calledOnce).to.be.true
    })
  })

  describe('getTokenNameAndSymbol', () => {
    it('should return token name and symbol', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().resolves('Test Token')
      const stubSymbol = sandbox.stub().resolves('TST')
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      const result = await MockedWeb3Helper.getTokenNameAndSymbol('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({
        name: 'Test Token',
        symbol: 'TST',
      })
      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
    })

    it('should fails return token name and symbol', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubName = sandbox.stub().rejects(new Error('Test Error'))
      const stubSymbol = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { name: stubName, symbol: stubSymbol }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      const result = await MockedWeb3Helper.getTokenNameAndSymbol('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.deep.equal({
        name: null,
        symbol: null,
      })
      expect(stubName.calledOnce).to.be.true
      expect(stubSymbol.calledOnce).to.be.true
      expect(stubLogger.callCount).to.eq(2)
    })
  })

  describe('getTokenDecimals', () => {
    it('should return token decimals', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubDecimals = sandbox.stub().resolves(18)
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { decimals: stubDecimals }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      const result = await MockedWeb3Helper.getTokenDecimals('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(18)
      expect(stubDecimals.calledOnce).to.be.true
    })

    it('should fails return token decimals', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubDecimals = sandbox.stub().rejects(new Error('Test Error'))
      const stubLogger = sandbox.stub(logger, 'warn')
      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { decimals: stubDecimals }
          },
          getAddress: () => '0xTokenAddress',
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })
      const result = await MockedWeb3Helper.getTokenDecimals('0xTokenAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(0)
      expect(stubDecimals.calledOnce).to.be.true
      expect(stubLogger.callCount).to.eq(1)
    })
  })

  describe('getLockTokenAddress', () => {
    it('should return the lock token address successfully', async () => {
      const stubLockToken = sandbox.stub().resolves('0xLockTokenAddress')
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { lockNFT: stubLockToken }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getLockTokenAddress(fakePluginAddress, fakeNetwork)

      expect(result).to.equal('0xLockTokenAddress')
      expect(stubLockToken.calledOnce).to.be.true
    })

    it('should return null if fetching lock token address fails', async () => {
      const stubLockToken = sandbox.stub().rejects(new Error('fake-error'))
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const MockedWeb3Helper = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { lockNFT: stubLockToken }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      }).default

      const fakePluginAddress = '0xPluginAddress'
      const fakeNetwork = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.getLockTokenAddress(fakePluginAddress, fakeNetwork)

      expect(result).to.be.null
      expect(stubLockToken.calledOnce).to.be.true
    })
  })

  describe('isMember', () => {
    it('should return true when address is a member of the plugin', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubIsMember = sandbox.stub().resolves(true)

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListed: stubIsMember }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const memberAddress = '0xMemberAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.isMember(pluginAddress, memberAddress, network)

      expect(result).to.be.true
      expect(stubIsMember.calledOnce).to.be.true
      expect(stubIsMember.calledWith(memberAddress)).to.be.true
    })

    it('should return false when address is not a member of the plugin', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubIsMember = sandbox.stub().resolves(false)

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListed: stubIsMember }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const memberAddress = '0xMemberAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.isMember(pluginAddress, memberAddress, network)

      expect(result).to.be.false
      expect(stubIsMember.calledOnce).to.be.true
      expect(stubIsMember.calledWith(memberAddress)).to.be.true
    })

    it('should return false when an error occurs', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubIsMember = sandbox.stub().rejects(new Error('Contract call failed'))
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedWeb3Helper } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { isListed: stubIsMember }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const pluginAddress = '0xPluginAddress'
      const memberAddress = '0xMemberAddress'
      const network = NetworksEnum.ethereumMainnet

      const result = await MockedWeb3Helper.isMember(pluginAddress, memberAddress, network)

      expect(result).to.be.false
      expect(stubIsMember.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error isMember' as any)).to.be.true
    })
  })
})
