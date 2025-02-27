import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import config from '@config'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import proxyquire from 'proxyquire'
import utils from '@helpers/utils'

describe('Modules: RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    RabbitMQ.connection = null
    RabbitMQ.channelsMap.clear()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('connect', () => {
    it('should establish a connection and set up channels', async () => {
      const { default: RabbitMQ } = proxyquire.noCallThru()('@modules/rabbitMQ', {
        'amqp-connection-manager': {
          connect: sandbox.stub().returns({
            on: sandbox.stub(),
            createChannel: sandbox.stub().returns({ on: sandbox.stub() }),
          }),
        },
      })

      await RabbitMQ.connect()

      expect(RabbitMQ.channelsMap.size).to.eq(Object.values(EnumQueueName).length)
    })

    it('should not reconnect if already connected', async () => {
      const mockConnection = { on: sandbox.stub() } as unknown as AmqpConnectionManager
      RabbitMQ.connection = mockConnection

      const mockConnect = sandbox.stub().returns(mockConnection)
      sandbox.stub(connect as any, 'bind').returns(mockConnect as any)

      await RabbitMQ.connect()

      expect(mockConnect.notCalled).to.be.true
    })
  })

  describe('getChannel', () => {
    it('should return the correct channel for a queue', () => {
      const queueName = EnumQueueName.contractInfo
      const mockChannel = { sendToQueue: sandbox.stub() } as unknown as ChannelWrapper
      RabbitMQ.channelsMap.set(queueName, mockChannel)

      RabbitMQ.connection = true as any
      const channel = RabbitMQ.getChannel(queueName)
      expect(channel).to.equal(mockChannel)
    })

    it('should throw an error if RabbitMQ is not connected', () => {
      const queueName = EnumQueueName.contractInfo
      RabbitMQ.connection = null

      expect(() => RabbitMQ.getChannel(queueName)).to.throw('RabbitMQ is not connected. Call RabbitMQ.connect() first.')
    })

    it('should throw an error if no channel exists for a queue', () => {
      const queueName = EnumQueueName.contractInfo
      RabbitMQ.connection = {} as AmqpConnectionManager // Mock connected state

      expect(() => RabbitMQ.getChannel(queueName)).to.throw(`No channel found for queue "${queueName}"`)
    })
  })

  describe('close', () => {
    it('should close the connection and log the event', async () => {
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')
      const mockConnection = {
        close: sandbox.stub().resolves(),
      }

      RabbitMQ.connection = mockConnection as any

      await RabbitMQ.close()

      expect(mockConnection.close.calledOnce).to.be.true
      expect(mockLoggerVerbose.calledWith('RabbitMQ connection closed' as any)).to.be.true
    })

    it('should log a warning if an error occurs during closing', async () => {
      const mockLoggerWarn = sandbox.stub(logger, 'warn')
      const mockConnection = {
        close: sandbox.stub().rejects(new Error('Close error')),
      } as unknown as AmqpConnectionManager

      RabbitMQ.connection = mockConnection

      await RabbitMQ.close()

      expect(mockLoggerWarn.calledWith('Error closing RabbitMQ connection' as any)).to.be.true
      expect(RabbitMQ.connection).to.be.null
    })
  })
})
