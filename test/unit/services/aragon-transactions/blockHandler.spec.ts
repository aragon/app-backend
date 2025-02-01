import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { RabbitMQHelper } from '@helpers/radditMQ'
import utils from '@helpers/utils'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import type Dao from '@models/schema/dao'
import Web3Helper from '@helpers/web3'
import {Interface} from "ethers";
import {DAO} from "@artifacts/dao";
import {GovernanceERC20} from "@artifacts/GovernanceERC20";

describe('AragonTransactions: BlockHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('processNewBlock', () => {
    let stubLoggerError: sinon.SinonStub
    let stubGetProvider: sinon.SinonStub
    let stubGetBlockReceipts: sinon.SinonStub
    let stubUtilsWait: sinon.SinonStub
    let stubCheckIfDepositEvents: sinon.SinonStub
    let stubProcessReceiver: sinon.SinonStub

    beforeEach(() => {
      stubLoggerError = sandbox.stub(logger, 'error')
      stubGetProvider = sandbox.stub(ProviderModule, 'getProvider')
      stubGetBlockReceipts = sandbox.stub(Web3Helper, 'getBlockReceipts')
      stubUtilsWait = sandbox.stub(utils, 'wait').resolves()
      stubCheckIfDepositEvents = sandbox.stub(BlockHandler as any, '_checkIfDepositEvents').resolves()
      stubProcessReceiver = sandbox.stub(BlockHandler, 'processReceiver').resolves()
    })

    it('should do nothing if block has no transactions', async () => {
      const fakeBlock = { number: 123, transactions: [] }
      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubGetProvider.called).to.be.false
      expect(stubLoggerError.called).to.be.false
      expect(stubCheckIfDepositEvents.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
    })

    it('should log error and return if provider not available', async () => {
      const fakeBlock = { number: 123, transactions: ['0xabc'] }

      stubGetProvider.returns(null)

      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubCheckIfDepositEvents.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
    })

    it('should return early if blockReceipts is falsy', async () => {
      const fakeBlock = { number: 123, hash: '0xhash', transactions: ['0xabc'] }
      const fakeProvider = { send: stubGetBlockReceipts }
      stubGetBlockReceipts.resolves(null)

      stubGetProvider.returns(fakeProvider)

      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubUtilsWait.called).to.be.false
      expect(stubCheckIfDepositEvents.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
    })

    it('should wait, check deposit events, and processReceiver if blockReceipts exist', async () => {
      const fakeBlock = {
        number: 123,
        hash: '0xblockHash',
        transactions: ['0xabc', '0xdef'],
      }
      const fakeProvider = { send: stubGetBlockReceipts }
      const fakeReceipts = [
        { to: '0x1111111111111111111111111111111111111111' },
        { to: '0x2222222222222222222222222222222222222222' },
      ]

      stubGetBlockReceipts.resolves(fakeReceipts)
      stubGetProvider.returns(fakeProvider)

      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubUtilsWait.calledOnce).to.be.true
      expect(stubCheckIfDepositEvents.calledOnceWith(fakeBlock, NetworksEnum.ethereumMainnet)).to.be.true
      expect(stubProcessReceiver.calledOnce).to.be.true
      expect(stubProcessReceiver.firstCall.args[0]).to.equal('0xblockHash')
      expect(stubProcessReceiver.firstCall.args[1]).to.deep.equal([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ])
      expect(stubProcessReceiver.firstCall.args[2]).to.equal(NetworksEnum.ethereumMainnet)
    })
  })

  describe('processReceiver', () => {
    let stubLoggerVerbose: sinon.SinonStub
    let stubLoggerError: sinon.SinonStub
    let stubDaoFind: sinon.SinonStub
    let stubSendDaoMessages: sinon.SinonStub

    beforeEach(() => {
      stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      stubLoggerError = sandbox.stub(logger, 'error')
      // In the actual code: Models.Dao.find({ address: { $in: toAddresses }, network })
      stubDaoFind = sandbox.stub(Models.Dao, 'find')
      stubSendDaoMessages = sandbox.stub(BlockHandler, 'sendDaoMessages')
    })

    it('should do nothing if no DAOs are found', async () => {
      stubDaoFind.resolves([])

      await BlockHandler.processReceiver('0xabc', ['0xdao1', '0xdao2'], NetworksEnum.ethereumMainnet)

      expect(stubDaoFind.calledOnce).to.be.true
      expect(stubLoggerVerbose.called).to.be.false
      expect(stubSendDaoMessages.called).to.be.false
    })

    it('should log and call sendDaoMessages for each found DAO', async () => {
      const fakeDao1 = { address: '0xdao1', network: NetworksEnum.ethereumMainnet }
      const fakeDao2 = { address: '0xdao2', network: NetworksEnum.ethereumMainnet }

      stubDaoFind.resolves([fakeDao1, fakeDao2])
      stubSendDaoMessages.resolves()

      await BlockHandler.processReceiver('0xtransactionHash', ['0xdao1', '0xdao2'], NetworksEnum.ethereumMainnet)

      expect(stubDaoFind.calledOnce).to.be.true
      expect(stubDaoFind.firstCall.args[0]).to.deep.equal({
        address: { $in: ['0xdao1', '0xdao2'] },
        network: NetworksEnum.ethereumMainnet,
      })

      expect(stubLoggerVerbose.callCount).to.equal(2)
      expect(stubSendDaoMessages.callCount).to.equal(2)
      expect(stubSendDaoMessages.firstCall.args[0]).to.equal(fakeDao1)
      expect(stubSendDaoMessages.secondCall.args[0]).to.equal(fakeDao2)
      expect(stubLoggerError.called).to.be.false
    })
  })

  describe('_checkIfDepositEvents', () => {
    let stubGetProvider: sinon.SinonStub
    let stubProviderGetLogs: sinon.SinonStub
    let stubProcessReceiver: sinon.SinonStub

    let topicHash: string[] = []

    beforeEach(() => {

       topicHash = [
        new Interface(DAO.abi).getEvent('NativeTokenDeposited')?.topicHash!,
        new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!,
      ]

      stubGetProvider = sandbox.stub(ProviderModule, 'getProvider')
      stubProviderGetLogs = sandbox.stub()
      stubProcessReceiver = sandbox.stub(BlockHandler, 'processReceiver').resolves()
    })

    afterEach(() => {
      sandbox.restore()
    })

    it('should do nothing if logs are empty', async () => {
      const fakeBlock = { number: 123 }
      const fakeProvider = { getLogs: stubProviderGetLogs }

      stubGetProvider.returns(fakeProvider)
      stubProviderGetLogs.resolves([])

      await (BlockHandler as any)._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubProviderGetLogs.calledOnce).to.be.true
    })

    it('should call processReceiver for transfer', async () => {
      const fakeBlock = { number: 123 }
      const fakeProvider = { getLogs: stubProviderGetLogs }
      const logs = [
        { transactionHash: '0xabc', address: '0x123', topics: [topicHash[1]]},
      ]

      const fakeDecoded = { args: { to: '0xdecoded' } }
      const parseLogStub = sandbox
        .stub(Interface.prototype, 'parseLog')
        .returns(fakeDecoded as any)

      stubGetProvider.returns(fakeProvider)
      stubProviderGetLogs.resolves(logs)

      await (BlockHandler as any)._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubProviderGetLogs.calledOnce).to.be.true
      expect(parseLogStub.calledOnce).to.be.true

      expect(stubProcessReceiver.calledOnceWith('0xabc', ['0xdecoded'], NetworksEnum.ethereumMainnet)).to.be.true
    });

    it('should log error processReceiver for transfer', async () => {
      const fakeBlock = { number: 123 }
      const fakeProvider = { getLogs: stubProviderGetLogs }
      const logs = [
        { transactionHash: '0xabc', address: '0x123', topics: [topicHash[1]]},
      ]

      const parseLogStub = sandbox
        .stub(Interface.prototype, 'parseLog')
        .throws(new Error('Error decoding transfer event'))

      stubGetProvider.returns(fakeProvider)
      stubProviderGetLogs.resolves(logs)

      const loggerError = sandbox.stub(logger, 'error')

      await (BlockHandler as any)._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubProviderGetLogs.calledOnce).to.be.true
      expect(parseLogStub.calledOnce).to.be.true
      expect(loggerError.calledOnce).to.be.true

      expect(stubProcessReceiver.calledOnce).to.be.false
    })

    it('should call processReceiver for each log found for native token deposit', async () => {
      const fakeBlock = { number: 123 }
      const fakeProvider = { getLogs: stubProviderGetLogs }
      const logs = [
        { transactionHash: '0xabc', address: '0x123', topics: [topicHash[0]]},
        { transactionHash: '0xdef', address: '0x456', topics: [topicHash[0]]},
      ]

      stubGetProvider.returns(fakeProvider)
      stubProviderGetLogs.resolves(logs)

      await (BlockHandler as any)._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)

      expect(stubProviderGetLogs.calledOnce).to.be.true

      expect(stubProcessReceiver.calledOnceWith('0xabc', ['0x123', '0x456'], NetworksEnum.ethereumMainnet))
    })
  })

  describe('sendDaoMessages', () => {
    let stubLoggerInfo: sinon.SinonStub
    let stubLoggerError: sinon.SinonStub
    let stubRabbitSend: sinon.SinonStub

    beforeEach(() => {
      stubLoggerInfo = sandbox.stub(logger, 'info')
      stubLoggerError = sandbox.stub(logger, 'error')
      stubRabbitSend = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    })

    it('should send all messages successfully', async () => {
      const fakeDao: Dao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      } as Dao

      await BlockHandler.sendDaoMessages(fakeDao)

      expect(stubRabbitSend.calledThrice).to.be.true

      expect(stubRabbitSend.firstCall.args[0]).to.equal('dao.transactions')
      expect(stubRabbitSend.firstCall.args[1]).to.deep.equal({
        id: '0xdao',
        params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
      })

      expect(stubRabbitSend.secondCall.args[0]).to.equal('dao.assets')
      expect(stubRabbitSend.secondCall.args[1]).to.deep.equal({
        id: '0xdao',
        params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
      })

      expect(stubRabbitSend.thirdCall.args[0]).to.equal('dao.metrics')
      expect(stubRabbitSend.thirdCall.args[1]).to.deep.equal({
        id: '0xdao',
        params: { address: '0xdao', network: NetworksEnum.ethereumMainnet },
      })

      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubLoggerError.called).to.be.false
    })

    it('should log error if sending messages fails', async () => {
      const fakeDao: Dao = {
        address: '0xdao',
        network: NetworksEnum.ethereumMainnet,
      } as Dao

      stubRabbitSend.onSecondCall().rejects(new Error('Failed to send'))

      await BlockHandler.sendDaoMessages(fakeDao)

      expect(stubRabbitSend.calledThrice).to.be.true
      expect(stubLoggerInfo.called).to.be.false
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubLoggerError.firstCall.args[0]).to.equal('Failed to send RabbitMQ messages')
    })
  })
})
