import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MongoDB from '@modules/mongo'
import logger from '@logger'
import Connections from '@modules/connections'
import { EnumConnection } from '@types'
import ProviderModule from '@modules/provider'
import RabbitMQ from '@modules/rabbitMQ'

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
    stubRabbitConnect = sandbox.stub(RabbitMQ, 'connect')
    stubRabbitDisconnect = sandbox.stub(RabbitMQ, 'close')
    stubBlockchainConnect = sandbox.stub(ProviderModule, 'connectToAllNetworks')
    stubBlockchainDisconnect = sandbox.stub(ProviderModule, 'closeAllNetworks')
    stubDBConnect = sandbox.stub(MongoDB, 'connect')
    stubDBDisconnect = sandbox.stub(MongoDB, 'disconnect')
  })

  afterEach(() => {
    Connections.openedConnections = []
    sandbox?.restore()
  })

  describe('Open', () => {
    it('Should open db', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const res = await Connections.open([EnumConnection.MONGODB])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections open' as any)).to.be.true
    })

    it('Should open all', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const res = await Connections.open([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubRabbitConnect.calledOnce).to.be.true
      expect(stubBlockchainConnect.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections open' as any)).to.be.true
    })

    it('Should throw when unknown connection', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await expect(Connections.open(['unknown' as any])).to.be.rejectedWith(Error, 'Unknown service to connect to')
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to open connections' as any)).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should throw on error', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      stubDBConnect.rejects(new Error('fake-error'))

      await expect(Connections.open([EnumConnection.MONGODB])).to.be['rejectedWith'](Error, 'fake-error')
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to open connections' as any)).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should open check already open', async () => {
      const res = await Connections.open([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubBlockchainConnect.calledOnce).to.be.true

      const res1 = await Connections.open([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])
      expect(res1).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubBlockchainConnect.calledOnce).to.be.true
    })
  })

  describe('Close', () => {
    it('Should close any open', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubLoggerPurge = sandbox.stub(logger, 'purge')

      await Connections.close()

      expect(stubDBDisconnect.callCount).to.eq(0)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections closed' as any)).to.be.true
      expect(stubLoggerPurge.calledOnce).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should close all', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubLoggerPurge = sandbox.stub(logger, 'purge')
      Connections.openedConnections = [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN, EnumConnection.RABBITMQ]

      await Connections.close()

      expect(stubRabbitDisconnect.calledOnce).to.be.true
      expect(stubDBDisconnect.calledOnce).to.be.true
      expect(stubBlockchainDisconnect.calledOnce).to.be.true

      // expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections closed' as any)).to.be.true
      expect(stubLoggerPurge.calledOnce).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should throw to close unknown connection', async () => {
      Connections.openedConnections = ['unknown' as any]
      const stubLogger = sandbox.stub(logger, 'error')
      await expect(Connections.close()).to.be.rejectedWith(Error, 'Unknown service to disconnect from')
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to close connections' as any)).to.be.true
    })
  })
})
