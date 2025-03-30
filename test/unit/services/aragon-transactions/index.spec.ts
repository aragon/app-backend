import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { EnumQueueName, NetworksEnum } from '@types'
import AragonTransactionsService from '@services/aragon-transactions/index'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('AragonTransactions: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('start the rabbitmq process and log service start', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await AragonTransactionsService.start()

      expect(processStub.calledOnce).to.be.true
      expect(processStub.calledOnceWith(EnumQueueName.realtimeTransactions, sandbox.match.func)).to.be.true
      expect(loggerInfoStub.calledOnceWith('Aragon Transaction service started' as any)).to.be.true
    })

    it('should process the realtimeTransactions queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process')
      const blockHandlerStub = sandbox.stub(BlockHandler, 'processReceiver').resolves()

      sandbox.stub(logger, 'info')
      await AragonTransactionsService.start()

      expect(processStub.calledOnce).to.be.true
      expect(processStub.args[0][0]).to.eq(EnumQueueName.realtimeTransactions)

      const handler = processStub.getCall(0).args[1]
      await handler({
        id: 'some-id',
        params: { addresses: '0xDaoAddress', network: NetworksEnum.ethereumMainnet, transactionHash: '0xtx' },
      })

      expect(blockHandlerStub.calledOnce).to.be.true
    })
  })

  describe('stop', () => {
    it('should stop the task scheduler and log service stop', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await AragonTransactionsService.stop()

      expect(loggerInfoStub.calledOnceWith('IndexerService service stopped' as any)).to.be.true
    })
  })
})
