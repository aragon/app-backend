import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Web3Utils from '@helpers/web3'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import { id } from 'ethers'
import { ConfigState } from '@state/configState'
import Logger from '@logger'
import proxyquire from 'proxyquire'

describe('Helpers:Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('parseMetadata', function () {
    it('should parseMetadata', function () {
      expect(
        Web3Utils.parseMetadata({
          name: 'test',
          description: 'test',
          avatar: 'test',
          links: [{ name: 'test', url: 'test' }],
        }),
      ).to.deep.equal({
        name: 'test',
        description: 'test',
        avatar: 'test',
        links: [{ name: 'test', url: 'test' }],
      })

      expect(Web3Utils.parseMetadata({})).to.deep.equal({
        name: null,
        description: null,
        avatar: null,
        links: [],
      })
    })

    it('error parseAddress', function () {
      const address = '0xInvalidAddress'
      const stubLogger = sandbox.stub(Logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.be.null
      expect(stubLogger.calledWith('Error checksum dao address' as any)).to.be.true
    })
  })

  describe('parseAddress', function () {
    it('should parseAddress', function () {
      const address = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
      const expectedChecksumAddress = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
      const stubLogger = sandbox.stub(Logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.equal(expectedChecksumAddress)
      expect(stubLogger.notCalled).to.be.true
    })

    it('error parseAddress', function () {
      const address = '0xInvalidAddress'
      const stubLogger = sandbox.stub(Logger, 'error')

      const result = Web3Utils.parseAddress(address)

      expect(result).to.be.null
      expect(stubLogger.calledWith('Error checksum dao address' as any)).to.be.true
    })
  })

  describe('getAddressFromEns', function () {
    it('should get address from ens', async () => {
      const resolveName = sandbox.stub().resolves('0x000001')
      const stubInstance = sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        resolveName,
      })

      const name = 'aavegotchi.dao.eth'
      const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.mainnet)

      expect(address).to.eq('0x000001')
      expect(stubInstance.calledOnce).to.be.true
      expect(stubInstance.calledWith(NetworksEnum.mainnet)).to.be.true
      expect(resolveName.calledOnce).to.be.true
    })

    it('should fail to get address from ens', async () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      const name = 'aavegotchi.dao.eth'
      const address = await Web3Helper.getAddressFromEns(name, NetworksEnum.mainnet)

      expect(address).to.eq(null)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error resolving ENS name' as any)).to.be.true
    })
  })

  describe('getEnsFromAddress', function () {
    it('should get address from ens', async () => {
      const lookupAddress = sandbox.stub().resolves('aavegotchi.dao.eth')
      const stubInstance = sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        lookupAddress,
      })

      const address = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
      const ensName = await Web3Helper.getEnsFromAddress(address, NetworksEnum.mainnet)

      expect(ensName).to.eq('aavegotchi.dao.eth')
      expect(stubInstance.calledOnce).to.be.true
      expect(stubInstance.calledWith(NetworksEnum.mainnet)).to.be.true
      expect(lookupAddress.calledOnce).to.be.true
    })

    it('should fail to get address from ens', async () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').rejects(new Error('fake-error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      const address = '0xF1cf9aFc900Ce3426A235212e164587A6274736A'
      const ensName = await Web3Helper.getEnsFromAddress(address, NetworksEnum.mainnet)

      expect(ensName).to.eq(null)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error looking up address' as any)).to.be.true
    })
  })

  describe('ensExists', function () {
    it('should check if ensExists', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const stubRecordExistsStub = sandbox.stub().resolves(true)
      const { default: MockedWeb3Utils } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { recordExists: stubRecordExistsStub }
          },
          namehash: function () {
            return '0xb9b3537ea1117f65799f21b36bbc6357724953d5bf9cca09f0757b7ac3e81f37'
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const ensName = 'aavegotchi.dao.eth'
      const result = await MockedWeb3Utils.ensExists(ensName, NetworksEnum.mainnet)

      expect(result).to.be.true
      expect(stubRecordExistsStub.calledOnce).to.be.true
    })

    it('should log an error if checking ENS existence fails', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }
      const error = new Error('Contract call failed')
      const stubRecordExistsStub = sandbox.stub().rejects(error) // Simulate error
      const stubLoggerError = sandbox.stub(Logger, 'error') // Stub logger's error to verify it's called

      const { default: MockedWeb3Utils } = proxyquire.noCallThru()('@helpers/web3', {
        ethers: {
          Contract: function () {
            return { recordExists: stubRecordExistsStub }
          },
          namehash: function () {
            return '0xb9b3537ea1117f65799f21b36bbc6357724953d5bf9cca09f0757b7ac3e81f37'
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
        '@logger': Logger, // Ensure the real logger is replaced by the stubbed one
      })

      const ensName = 'aavegotchi.dao.eth'
      const result = await MockedWeb3Utils.ensExists(ensName, NetworksEnum.mainnet)

      expect(result).to.be.false
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.calledWith('Error ensExists' as any)).to.be.true
    })
  })

  describe('queryLogs', function () {
    it('should query logs successfully', async () => {
      const fakeLogs = [{ logIndex: 0, data: '0x', topics: ['0x123'] }]
      const getLogsStub = sandbox.stub().resolves(fakeLogs)
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getLogs: getLogsStub,
      })

      const filter = {
        fromBlock: 0,
        toBlock: 'latest',
        address: '0xContractAddress',
        topics: [id('EventName(uint256,address)')],
      }

      const logs = await Web3Utils.queryLogs(filter, NetworksEnum.mainnet)

      expect(logs).to.deep.equal(fakeLogs)
      expect(getLogsStub.calledOnceWithExactly(filter)).to.be.true
    })

    it('should fails query logs', async () => {
      const error = new Error('Failed to fetch logs')
      const getLogsStub = sandbox.stub().rejects(error)
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getLogs: getLogsStub,
      })
      const stubLoggerError = sandbox.stub(Logger, 'error') // Stub logger's error to verify it's called

      const filter = {
        fromBlock: 0,
        toBlock: 'latest',
        address: '0xContractAddress',
        topics: [id('EventName(uint256,address)')],
      }

      const logs = await Web3Utils.queryLogs(filter, NetworksEnum.mainnet)

      expect(logs).to.deep.equal([])
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.firstCall.args[0]).to.include('Error querying logs')
    })
  })

  describe('getTransaction', () => {
    it('should getTransaction successfully', async () => {
      const txHash = '0x0'
      const getTransactionStub = sandbox.stub().resolves(true)
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransaction: getTransactionStub,
      })

      const result = await Web3Utils.getTransaction(txHash, NetworksEnum.mainnet)

      expect(result).to.be.true
    })

    it('should fails getTransaction', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(Logger, 'error')
      const getTransactionStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransaction: getTransactionStub,
      })

      const result = await Web3Utils.getTransaction(txHash, NetworksEnum.mainnet)

      expect(result).to.be.null
      expect(getTransactionStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction' as any)).to.be.true
    })
  })

  describe('getTransactionReceipt', () => {
    it('should getTransactionReceipt successfully', async () => {
      const txHash = '0x0'
      const getTransactionReceiptStubStub = sandbox.stub().resolves(true)
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransactionReceipt: getTransactionReceiptStubStub,
      })

      const result = await Web3Utils.getTransactionReceipt(txHash, NetworksEnum.mainnet)

      expect(result).to.be.true
      expect(getTransactionReceiptStubStub.calledOnceWith(txHash)).to.be.true
    })

    it('should fails getTransactionReceipt', async () => {
      const txHash = '0x0'
      const stubLogger = sandbox.stub(Logger, 'error')
      const getTransactionReceiptStub = sandbox.stub().rejects(new Error('fake-error'))
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns({
        getTransactionReceipt: getTransactionReceiptStub,
      })

      const result = await Web3Utils.getTransactionReceipt(txHash, NetworksEnum.mainnet)

      expect(result).to.be.null
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      expect(stubLogger.calledOnceWith('Error get transaction receipt' as any)).to.be.true
    })
  })
})
