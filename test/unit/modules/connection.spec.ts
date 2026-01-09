import Utils from '@helpers/utils'
import logger from '@logger'
import Connections from '@modules/connections'
import MongoDB from '@modules/mongo'
import ProviderModule from '@modules/provider'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumConnection } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: connection', () => {
  let sandbox: SinonSandbox
  let stubDBConnect: any
  let stubDBDisconnect: any
  let stubBlockchainConnect: any
  let stubBlockchainDisconnect: any
  let stubRabbitConnect: any
  let stubRabbitDisconnect: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    stubRabbitConnect = sandbox.stub(RabbitMQ, 'connect').resolves(true)
    stubRabbitDisconnect = sandbox.stub(RabbitMQ, 'close').resolves()
    stubBlockchainConnect = sandbox.stub(ProviderModule, 'connectToAllNetworks').resolves()
    stubBlockchainDisconnect = sandbox.stub(ProviderModule, 'closeAllNetworks').resolves()
    stubDBConnect = sandbox.stub(MongoDB, 'connect').resolves()
    stubDBDisconnect = sandbox.stub(MongoDB, 'disconnect').resolves()

    // Reset connections
    Connections.openedConnections = []
  })

  afterEach(() => {
    Connections.openedConnections = []
    sandbox?.restore()
  })

  describe('Open', () => {
    it('Should open db', async () => {
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubLoggerInfo = sandbox.stub(logger, 'info')

      const res = await Connections.open([EnumConnection.MONGODB])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubLoggerVerbose.calledWith('Opening connection' as any)).to.be.true
      expect(stubLoggerVerbose.calledWith('Connection opened successfully' as any)).to.be.true
      expect(stubLoggerInfo.calledWith('All connections opened' as any)).to.be.true
      expect(Connections.openedConnections).to.include(EnumConnection.MONGODB)
    })

    it('Should open all', async () => {
      const stubLoggerInfo = sandbox.stub(logger, 'info')

      const res = await Connections.open([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubRabbitConnect.calledOnce).to.be.true
      expect(stubBlockchainConnect.calledOnce).to.be.true
      expect(stubLoggerInfo.calledWith('All connections opened' as any)).to.be.true
      expect(Connections.openedConnections).to.have.lengthOf(3)
    })

    it('Should throw when unknown connection', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')

      try {
        await Connections.open(['unknown' as any])
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.include('Unknown connection type: unknown')
        expect(stubLoggerError.calledWith('Unable to open connections' as any)).to.be.true
        expect(Connections.openedConnections).to.be.deep.eq([])
      }
    })

    it('Should throw on error and close opened connections', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      stubDBConnect.rejects(new Error('fake-error'))

      try {
        await Connections.open([EnumConnection.MONGODB])
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.equal('fake-error')
        expect(stubLoggerError.calledWith('Unable to open connections' as any)).to.be.true
        expect(Connections.openedConnections).to.be.deep.eq([])
      }
    })

    it('Should skip already open connections', async () => {
      // First open
      await Connections.open([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])

      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubBlockchainConnect.calledOnce).to.be.true

      // Second open - should skip already opened
      await Connections.open([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])

      expect(stubDBConnect.calledOnce).to.be.true // Still only called once
      expect(stubBlockchainConnect.calledOnce).to.be.true // Still only called once
    })

    it('Should handle partial failures', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      stubRabbitConnect.rejects(new Error('rabbit-error'))

      try {
        await Connections.open([EnumConnection.MONGODB, EnumConnection.RABBITMQ])
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.equal('rabbit-error')
        expect(stubDBConnect.calledOnce).to.be.true
        expect(stubDBDisconnect.calledOnce).to.be.true // Should close MongoDB
        expect(stubLoggerError.calledWith('Unable to open connections' as any)).to.be.true
        expect(Connections.openedConnections).to.be.deep.eq([])
      }
    })
  })

  describe('Close', () => {
    it('Should handle no connections to close', async () => {
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubLoggerPurge = sandbox.stub(logger, 'purge')
      const stubWait = sandbox.stub(Utils, 'wait').resolves()

      await Connections.close()

      expect(stubDBDisconnect.called).to.be.false
      expect(stubLoggerVerbose.calledWith('No connections to close' as any)).to.be.true
      expect(stubLoggerPurge.called).to.be.false
      expect(stubWait.called).to.be.false
    })

    it('Should close all open connections', async () => {
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')
      const stubLoggerPurge = sandbox.stub(logger, 'purge')
      const stubWait = sandbox.stub(Utils, 'wait').resolves()

      Connections.openedConnections = [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ]

      await Connections.close()

      expect(stubRabbitDisconnect.calledOnce).to.be.true
      expect(stubDBDisconnect.calledOnce).to.be.true
      expect(stubBlockchainDisconnect.calledOnce).to.be.true
      expect(stubLoggerVerbose.calledWith('All connections closed' as any)).to.be.true
      expect(stubLoggerPurge.calledOnce).to.be.true
      expect(stubWait.calledWith(500)).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should handle unknown connection type in close', async () => {
      const stubLoggerWarn = sandbox.stub(logger, 'warn')
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerPurge = sandbox.stub(logger, 'purge')
      const stubWait = sandbox.stub(Utils, 'wait').resolves()

      Connections.openedConnections = ['unknown' as any]

      await Connections.close()

      expect(stubLoggerWarn.calledWith('Unknown connection type to disconnect' as any)).to.be.true
      expect(stubLoggerError.called).to.be.false // Should not error on unknown
      expect(stubLoggerPurge.calledOnce).to.be.true
      expect(stubWait.calledOnce).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should handle errors during close', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      stubDBDisconnect.rejects(new Error('close-error'))

      Connections.openedConnections = [EnumConnection.MONGODB]

      try {
        await Connections.close()
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.include('Failed to close connections: MONGODB')
        expect(stubLoggerError.calledWith('Failed to close connection' as any)).to.be.true
        expect(stubLoggerError.calledWith('Error closing connections' as any)).to.be.true
      }
    })
  })

  describe('closeSpecific', () => {
    it('Should close specific connections', async () => {
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      Connections.openedConnections = [EnumConnection.MONGODB, EnumConnection.RABBITMQ]

      await Connections.closeSpecific([EnumConnection.MONGODB])

      expect(stubDBDisconnect.calledOnce).to.be.true
      expect(stubRabbitDisconnect.called).to.be.false
      expect(stubLoggerVerbose.calledWith('Connection closed' as any)).to.be.true
      expect(Connections.openedConnections).to.deep.eq([EnumConnection.RABBITMQ])
    })

    it('Should handle multiple errors in closeSpecific', async () => {
      stubDBDisconnect.rejects(new Error('db-error'))
      stubRabbitDisconnect.rejects(new Error('rabbit-error'))

      Connections.openedConnections = [EnumConnection.MONGODB, EnumConnection.RABBITMQ]

      try {
        await Connections.closeSpecific([EnumConnection.MONGODB, EnumConnection.RABBITMQ])
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.include('Failed to close connections: MONGODB, RABBITMQ')
      }
    })
  })

  describe('isOpen', () => {
    it('Should return true for open connection', () => {
      Connections.openedConnections = [EnumConnection.MONGODB]
      expect(Connections.isOpen(EnumConnection.MONGODB)).to.be.true
    })

    it('Should return false for closed connection', () => {
      Connections.openedConnections = []
      expect(Connections.isOpen(EnumConnection.MONGODB)).to.be.false
    })
  })

  describe('getOpenConnections', () => {
    it('Should return copy of open connections', () => {
      Connections.openedConnections = [EnumConnection.MONGODB, EnumConnection.RABBITMQ]

      const open = Connections.getOpenConnections()

      expect(open).to.deep.eq([EnumConnection.MONGODB, EnumConnection.RABBITMQ])
      expect(open).to.not.equal(Connections.openedConnections) // Should be a copy
    })
  })

  describe('healthCheck', () => {
    it('Should check health of all connections', async () => {
      const stubMongoConnected = sandbox.stub(MongoDB, 'isConnected').returns(true)
      const stubRabbitConnected = sandbox.stub(RabbitMQ, 'isConnected').returns(false)

      Connections.openedConnections = [EnumConnection.MONGODB, EnumConnection.RABBITMQ, EnumConnection.BLOCKCHAIN]

      const health = await Connections.healthCheck()

      expect(health).to.deep.eq({
        [EnumConnection.MONGODB]: true,
        [EnumConnection.RABBITMQ]: false,
        [EnumConnection.BLOCKCHAIN]: true,
      })

      expect(stubMongoConnected.calledOnce).to.be.true
      expect(stubRabbitConnected.calledOnce).to.be.true
    })

    it('Should handle errors in health check', async () => {
      sandbox.stub(MongoDB, 'isConnected').throws(new Error('health-error'))

      Connections.openedConnections = [EnumConnection.MONGODB]

      const health = await Connections.healthCheck()

      expect(health).to.deep.eq({
        [EnumConnection.MONGODB]: false,
      })
    })
  })
})
