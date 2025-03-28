import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import type Dao from '@models/schema/dao'
import utils from '@helpers/utils'
describe('AragonTransactions: BlockHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
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
      sandbox.stub(utils, 'wait').resolves()

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
    })
  })
})
