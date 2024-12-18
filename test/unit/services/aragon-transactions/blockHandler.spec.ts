import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import logger from '@logger'
import { NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import { Models } from '@dbModels'
import { RabbitMQHelper } from '@helpers/redditMQ'
import utils from '@helpers/utils'
import type Dao from '@models/schema/dao'
import { TransactionResponse } from 'ethers'

describe('BlockHandler', () => {
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
    let stubFetchTransaction: sinon.SinonStub
    let stubProcessReceiver: sinon.SinonStub
    let stubCheckDepositEvents: sinon.SinonStub

    beforeEach(() => {
      stubLoggerError = sandbox.stub(logger, 'error')
      stubGetProvider = sandbox.stub(ProviderModule, 'getProvider')
      stubFetchTransaction = sandbox.stub(BlockHandler, 'fetchTransaction')
      stubProcessReceiver = sandbox.stub(BlockHandler, 'processReceiver')
      stubCheckDepositEvents = sandbox.stub(BlockHandler as any, '_checkIfDepositEvents')
    })

    it('should do nothing if block has no transactions', async () => {
      const fakeBlock = { transactions: [] }
      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubGetProvider.called).to.be.false
      expect(stubCheckDepositEvents.called).to.be.false
    })

    it('should log error and return if provider not available', async () => {
      const fakeBlock = { transactions: ['0xabc'] }
      stubGetProvider.returns(null)
      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubLoggerError.calledOnce).to.be.true
      expect(stubFetchTransaction.called).to.be.false
      expect(stubProcessReceiver.called).to.be.false
      expect(stubCheckDepositEvents.calledOnce).to.be.false
    })

    it('should skip transaction if tx.to is missing', async () => {
      const fakeBlock = { transactions: ['0xabc'] }
      const fakeProvider = {} as any
      stubGetProvider.returns(fakeProvider)
      stubFetchTransaction.resolves({ to: null } as TransactionResponse)
      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubFetchTransaction.calledOnce).to.be.true
      expect(stubProcessReceiver.called).to.be.false
      expect(stubCheckDepositEvents.calledOnce).to.be.true
    })

    it('should process receiver if tx.to exists', async () => {
      const fakeBlock = { transactions: ['0xabc'] }
      const fakeProvider = {} as any
      stubGetProvider.returns(fakeProvider)
      stubFetchTransaction.resolves({ to: '0xdef' } as TransactionResponse)
      await BlockHandler.processNewBlock(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubFetchTransaction.calledOnce).to.be.true
      expect(stubProcessReceiver.calledOnceWith('0xabc', '0xdef', NetworksEnum.ethereumMainnet)).to.be.true
      expect(stubCheckDepositEvents.calledOnce).to.be.true
    })
  })

  describe('processReceiver', () => {
    let stubLoggerVerbose: sinon.SinonStub
    let stubLoggerError: sinon.SinonStub
    let stubDaoFind: sinon.SinonStub
    let stubUtilsWait: sinon.SinonStub
    let stubSendDaoMessages: sinon.SinonStub

    beforeEach(() => {
      stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      stubLoggerError = sandbox.stub(logger, 'error')
      stubDaoFind = sandbox.stub(Models.Dao, 'findByAddress')
      stubUtilsWait = sandbox.stub(utils, 'wait').resolves()
      stubSendDaoMessages = sandbox.stub(BlockHandler, 'sendDaoMessages')
    })

    it('should do nothing if dao is not found', async () => {
      stubDaoFind.resolves(null)
      await BlockHandler.processReceiver('0xabc', '0xdao', NetworksEnum.ethereumMainnet)
      expect(stubLoggerVerbose.called).to.be.false
      expect(stubUtilsWait.called).to.be.false
      expect(stubSendDaoMessages.called).to.be.false
    })

    it('should wait, send messages and log confirmations if dao is found', async () => {
      const fakeDao = { address: '0xdao', network: NetworksEnum.ethereumMainnet } as Dao
      stubDaoFind.resolves(fakeDao)
      await BlockHandler.processReceiver('0xabc', '0xdao', NetworksEnum.ethereumMainnet)
      expect(stubLoggerVerbose.calledTwice).to.be.true
      expect(stubUtilsWait.calledOnce).to.be.true
      expect(stubSendDaoMessages.calledOnceWith(fakeDao)).to.be.true
      expect(stubLoggerError.called).to.be.false
    })
  })

  describe('_checkIfDepositEvents', () => {
    let stubProvider: any
    let stubGetProvider: sinon.SinonStub
    let stubProcessReceiver: sinon.SinonStub

    beforeEach(() => {
      stubProvider = {
        getLogs: sandbox.stub(),
      }
      stubGetProvider = sandbox.stub(ProviderModule, 'getProvider').returns(stubProvider)
      stubProcessReceiver = sandbox.stub(BlockHandler, 'processReceiver')
    })

    it('should do nothing if no logs found', async () => {
      const fakeBlock = { number: () => 123 }
      stubProvider.getLogs.resolves([])
      await (BlockHandler as any)._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubProcessReceiver.called).to.be.false
      expect(stubGetProvider.calledOnce).to.be.true
    })

    it('should call processReceiver for each log found', async () => {
      const fakeBlock = { number: () => 123 }
      stubProvider.getLogs.resolves([
        { transactionHash: '0xabc', address: '0xdao' },
        { transactionHash: '0xdef', address: '0xdao2' },
      ])
      await (BlockHandler as any)._checkIfDepositEvents(fakeBlock, NetworksEnum.ethereumMainnet)
      expect(stubProcessReceiver.calledTwice).to.be.true
      expect(stubProcessReceiver.firstCall.calledWith('0xabc', '0xdao', NetworksEnum.ethereumMainnet)).to.be.true
      expect(stubProcessReceiver.secondCall.calledWith('0xdef', '0xdao2', NetworksEnum.ethereumMainnet)).to.be.true
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
      const fakeDao = { address: '0xdao', network: NetworksEnum.ethereumMainnet } as Dao
      await BlockHandler.sendDaoMessages(fakeDao)
      expect(stubRabbitSend.calledThrice).to.be.true
      expect(stubLoggerInfo.calledOnce).to.be.true
      expect(stubLoggerError.called).to.be.false
    })

    it('should log error if sending messages fails', async () => {
      const fakeDao = { address: '0xdao', network: NetworksEnum.ethereumMainnet } as Dao
      stubRabbitSend.onSecondCall().rejects(new Error('Failed'))
      await BlockHandler.sendDaoMessages(fakeDao)
      expect(stubLoggerInfo.called).to.be.false
      expect(stubLoggerError.calledOnce).to.be.true
    })
  })

  describe('fetchTransaction', () => {
    let stubLoggerWarn: sinon.SinonStub

    beforeEach(() => {
      stubLoggerWarn = sandbox.stub(logger, 'warn')
    })

    it('should return transaction if successful', async () => {
      const fakeProvider = { getTransaction: sandbox.stub().resolves({ to: '0xdef' }) }
      const tx = await BlockHandler.fetchTransaction('0xabc', NetworksEnum.ethereumMainnet, fakeProvider as any)
      expect(tx).to.deep.equal({ to: '0xdef' })
      expect(stubLoggerWarn.called).to.be.false
    })

    it('should return null and log warning if fails', async () => {
      const fakeProvider = { getTransaction: sandbox.stub().rejects(new Error('fetch error')) }
      const tx = await BlockHandler.fetchTransaction('0xabc', NetworksEnum.ethereumMainnet, fakeProvider as any)
      expect(tx).to.be.null
      expect(stubLoggerWarn.calledOnce).to.be.true
    })
  })
})
