import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MongoDB from '@modules/mongo'
import logger from '@logger'
import Connections from '@modules/connections'

describe('Module: connection', () => {
  let sandbox: SinonSandbox
  let stubDBConnect: any
  let stubDBDisconnect: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
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
      const res = await Connections.open(['mongodb'])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections open' as any)).to.be.true
    })

    it('Should open all', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const res = await Connections.open(['mongodb'])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections open' as any)).to.be.true
    })

    it('Should throw when unknown connection', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await expect(Connections.open(['unknown'])).to.be.rejectedWith(
        Error,
        'Unknown service to connect to',
      )
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to open connections' as any)).to.be
        .true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should throw on error', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      stubDBConnect.rejects(new Error('fake-error'))

      await expect(Connections.open(['mongodb'])).to.be['rejectedWith'](
        Error,
        'fake-error',
      )
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to open connections' as any)).to.be
        .true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should open check already open', async () => {
      const res = await Connections.open(['mongodb'])

      expect(res).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true

      const res1 = await Connections.open(['mongodb'])
      expect(res1).to.be.true
      expect(stubDBConnect.calledOnce).to.be.true
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
      Connections.openedConnections = ['mongodb']

      await Connections.close()

      expect(stubDBDisconnect.calledOnce).to.be.true

      // expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Connections closed' as any)).to.be.true
      expect(stubLoggerPurge.calledOnce).to.be.true
      expect(Connections.openedConnections).to.be.deep.eq([])
    })

    it('Should throw to close unknown connection', async () => {
      Connections.openedConnections = ['unknown']
      const stubLogger = sandbox.stub(logger, 'error')
      await expect(Connections.close()).to.be.rejectedWith(
        Error,
        'Unknown service to disconnect from',
      )
      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Unable to close connections' as any)).to.be
        .true
    })
  })
})
